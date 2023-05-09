const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Worker } = require('worker_threads');
const Web3 = require('web3');
const dotenv = require('dotenv');
const fs = require('fs');

dotenv.config();
const app = express();
const port = process.env.PORT || 3000;
const IMPLEMENTATION_CODE = 0x01; // Constant value for the implementation code
const HISTORY_FILE = 'orders_history.txt'; // File to store all valid orders submitted to the API

// Middleware
app.use(cors());
app.use(bodyParser.json());

let currentOrderID = 0; // Current order ID. Used to identify orders in the order book
let currentBlockNumber = 0; // Current block height. Used to check if an order has expired
const orderBook = []; // Order book
const cancellations = []; // Cancellation list

// Matching engine worker
const matchingEngine = new Worker('./matchingEngine.js');

// Web3 setup
const web3 = new Web3(process.env.NODE_RPC_URL);
const contractABI = require('./abi/OrderBookExchange.json');
const contractAddress = process.env.CONTRACT_ADDRESS; // Add your contract address to '.env'
const contract = new web3.eth.Contract(contractABI, contractAddress);

// API endpoints
app.post('/api/orders', async (req, res) => {
    const order = req.body;
    order.id = currentOrderID;
    currentOrderID++;

    // Validate the order before adding it to the order book. Do compare the nonce with the on-chain value.
    if (await validateOrder(order, true)) {
        // Append the order to the archive file.
        fs.appendFile(HISTORY_FILE, JSON.stringify(order) + '\n', (err) => {
            if (err) console.log(err);
        });

        // Add the order to the order book
        orderBook.push(order);
        // Notify the matching engine of the new order
        matchingEngine.postMessage({ type: 'ADD_ORDER', order });

        res.status(201).send({ message: 'Order submitted successfully' });
    } else {
        res.status(400).send({ message: 'Invalid order' });
    }
});

// Periodically read events from the smart contract
setInterval(async () => {
    console.log("Reading cancel events from the smart contract...");
    const cancelEvents = await contract.getPastEvents('CancelOrder', {
        fromBlock: 'latest',
    });

    cancelEvents.forEach((event) => {
        const { user, nonce } = event.returnValues;

        // Check if the cancellation is already in the list
        const cancellationIndex = cancellations.findIndex(
            (cancellation) => cancellation.user === user && cancellation.nonce === nonce
        );

        // If the cancellation is not in the list, process it
        if (cancellationIndex === -1) {
            // Add the cancellation to the list
            cancellations.push({ user, nonce });

            // Remove any cancelled orders from the order book
            const orderIndex = orderBook.findIndex((order) => order.user === user && order.nonce <= nonce);
            if (orderIndex !== -1) {
                removeCancelledOrder(orderBook[orderIndex]);
            }
        }
    });
}, 30000); // Check every 30 seconds

// Periodically update current block height
setInterval(async () => {
    console.log("Updating block number...");
    let newBN = await web3.eth.getBlockNumber();
    if (newBN > currentBlockNumber) {
        currentBlockNumber = newBN;
        // Propagate change to the matching engine
        matchingEngine.postMessage({ type: 'UPDATE_BLOCK_NUMBER', blockNumber: currentBlockNumber });
    }
}, 10000); // Check every 10 seconds

// Listen for messages from the matching engine
matchingEngine.on('message', async (message) => {
    if (message.type === 'MATCH_FOUND') {
        const { orderA, orderB, amountA, amountB } = message;
        // Validate the orders again before executing the trade
        blockNumber = await web3.eth.getBlockNumber();

        // If one of the orders has become invalid, remove it from the order book
        if (!await validateOrder(orderA, true)) {
            removeCancelledOrder(orderA);
            return;
        }
        if (!await validateOrder(orderB, true)) {
            removeCancelledOrder(orderB);
            return;
        }

        // Execute the trade on-chain by sending the signed payloads to the smart contract
        executeTrade(orderA, orderB, amountA, amountB);

        // Remove the orders from the order book
        const orderAIndex = orderBook.findIndex((order) => order.id === orderA.id);
        const orderBIndex = orderBook.findIndex((order) => order.id === orderB.id);
        if (orderAIndex !== -1) orderBook.splice(orderAIndex, 1);
        if (orderBIndex !== -1) orderBook.splice(orderBIndex, 1);
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

async function validateOrder(order, checkNonce = false) {
    // Check if the parameters are valid (null, expired, improper values, etc.)
    if (
        !order.user ||
        !order.tokenA ||
        !order.tokenB ||
        !order.minAmountA ||
        !order.maxAmountA ||
        !order.price ||
        !order.maxSlippage ||
        !order.nonce ||
        !order.expiration ||
        !order.code ||
        !order.signature ||
        order.minAmountA > order.maxAmountA ||
        order.price <= 0 ||
        order.maxSlippage < 0 ||
        order.maxSlippage > 10000 ||
        order.expiration <= blockNumber
    ) return false;

    // Fetch the current nonce from the smart contract
    if (checkNonce) {
        const nonce = await contract.methods.nonces(order.user).call();
        if (order.nonce < nonce) return false;
    }

    // Perform additional variable checks using web3.js helpers
    if (
        !web3.utils.isAddress(order.user) ||
        !web3.utils.isAddress(order.tokenA) ||
        !web3.utils.isAddress(order.tokenB) ||
        !Number.isInteger(order.minAmountA) || order.minAmountA < 0 ||
        !Number.isInteger(order.maxAmountA) || order.maxAmountA < 0 ||
        !Number.isInteger(order.price) || order.price < 0 ||
        !Number.isInteger(order.maxSlippage) || order.maxSlippage < 0 ||
        !Number.isInteger(order.nonce) || order.nonce < 0 ||
        !Number.isInteger(order.expiration) || order.expiration < 0 ||
        !Number.isInteger(order.code) || order.code < 0
    ) return false;

    // Verify the order signature
    const messageHash = web3.utils.soliditySha3(
        { t: 'address', v: order.user },
        { t: 'address', v: order.tokenA },
        { t: 'address', v: order.tokenB },
        { t: 'uint256', v: order.minAmountA },
        { t: 'uint256', v: order.maxAmountA },
        { t: 'uint256', v: Math.floor(order.price * 2 ** 96) }, // Apply bitwise left-shift by 96
        { t: 'uint256', v: order.maxSlippage },
        { t: 'uint256', v: order.nonce },
        { t: 'uint256', v: order.expiration },
        { t: 'uint256', v: IMPLEMENTATION_CODE },
    );

    const signer = web3.eth.accounts.recover(
        messageHash,
        order.signature.v,
        order.signature.r,
        order.signature.s
    );

    if (signer !== order.user) return false;
}

// This function calls the executeTrade function in the smart contract to perform the trade.
async function executeTrade(orderA, orderB, amountA, amountB) {
    // Contract function
    const executeTradeData = contract.methods.executeTrade(
        orderA,
        orderB,
        amountA,
        amountB
    ).encodeABI();

    // Add on-chain trade execution logic here
    const gasPrice = await web3.eth.getGasPrice();

    const tx = {
        from: orderA.user,
        to: contractAddress,
        data: executeTradeData,
        gasPrice,
        gas: 500000, // Hard coded limit. Gas is estimated right after.
    };

    // Estimate gas required for the transaction
    const gas = await web3.eth.estimateGas(tx);
    tx.gas = gas * 1.1;

    // Send final transaction to the network
    const signedTx = await web3.eth.accounts.signTransaction(tx, process.env.EOA_PRIVATE_KEY);
    await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
}

// This function processes a trade cancellation. Either by smart contract nonce increase or by local invalidation.
async function removeCancelledOrder(order) {
    const orderIndex = orderBook.findIndex((o) => o.id === order.id);
    const order = orderBook.splice(orderIndex, 1)[0];

    // Notify the matching engine of the removed order
    matchingEngine.postMessage({ type: 'REMOVE_ORDER', order });
}
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

// Current order ID. Used to identify orders in the order book. Set to timestamp of now.
let currentOrderID = Date.now();
let currentBlockNumber = 0; // Current block height. Used to check if an order has expired
const orderBook = []; // Order book
const cancellations = []; // Cancellation list

// Matching engine worker
const matchingEngine = new Worker('./matchingEngine.js');

// Web3 setup
const web3 = new Web3(new Web3.providers.HttpProvider(process.env.NODE_RPC_URL)); // Add your web3 provider to '.env'
const contractJSON = fs.readFileSync('./abi/OrderBookExchange.json')
const contractABI = JSON.parse(contractJSON).abi;
const contractAddress = process.env.CONTRACT_ADDRESS; // Add your contract address to '.env'
const contract = new web3.eth.Contract(contractABI, contractAddress);

// Load order history from file
fs.readFile(HISTORY_FILE, 'utf8', (err, data) => {
    if (err) {
        console.log(err);
        return;
    }

    const lines = data.split('\n');
    lines.forEach((line) => {
        if (line !== '') {
            const order = JSON.parse(line);

            // If the order is still valid, add it to the order book
            if (validateOrder(order)) {
                orderBook.push(order);
            }
        }
    });
});

// API endpoints
app.post('/api/orders', async (req, res) => { // Receive new order from UI
    const order = req.body;
    order.id = currentOrderID;
    currentOrderID++;
    console.log("New order received:", order)

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
    console.log("Updating block number");
    let newBN = await web3.eth.getBlockNumber();
    if (newBN > currentBlockNumber) {
        currentBlockNumber = newBN;
        // Propagate change to the matching engine
        matchingEngine.postMessage({ type: 'UPDATE_BLOCK_NUMBER', blockNumber: currentBlockNumber });
    }
}, 10000); // Check every 10 seconds

// Listen for messages from the matching engine
matchingEngine.on('message', async (message) => {
    console.log("Message from matching engine:", message)
    if (message.type === 'MATCH_FOUND') {
        console.log("Match found. Message:", message);
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
    // Check if the parameters are valid (bounds check, expired, improper values, etc.)
    if (
        web3.utils.toBN(order.minAmountA).gt(web3.utils.toBN(order.maxAmountA)) ||
        web3.utils.toBN(order.priceX96).lte(web3.utils.toBN(0)) ||
        web3.utils.toBN(order.maxSlippage).lt(web3.utils.toBN(0)) ||
        web3.utils.toBN(order.maxSlippage).gt(web3.utils.toBN(10000)) ||
        web3.utils.toBN(order.expiration).lte(currentBlockNumber)
    ){
        console.log("Parameter bounds check failed");
        return false;
    }

    // Perform additional variable checks using web3.js helpers
    if (
        !web3.utils.isAddress(order.user) ||
        !web3.utils.isAddress(order.tokenA) ||
        !web3.utils.isAddress(order.tokenB)
    ){
        console.log("Not addresses");
        return false;
    }

    // Fetch the current nonce from the smart contract
    if (checkNonce) {
        let nonce = await contract.methods.nonces(order.user).call();
        if (web3.utils.toBN(order.nonce) < web3.utils.toBN(nonce)){
            console.log("Nonce check failed");
            return false;
        }
    }

    // Verify the order signature
    const messageHash = web3.utils.soliditySha3(
        { t: 'address', v: order.user },
        { t: 'address', v: order.tokenA },
        { t: 'address', v: order.tokenB },
        { t: 'uint256', v: order.minAmountA },
        { t: 'uint256', v: order.maxAmountA },
        { t: 'uint256', v: order.priceX96 },
        { t: 'uint256', v: order.maxSlippage },
        { t: 'uint256', v: order.nonce },
        { t: 'uint256', v: order.expiration },
        { t: 'uint256', v: order.code },
    );

    // Signature is received as a string in the format "0x000...abcd"
    const signer = web3.eth.accounts.recover(
        messageHash,
        order.signature
    ).toLowerCase();

    // Check if the signer is the same as the user, or if the signer is address(0)
    if (signer !== order.user || signer === "0x0000000000000000000000000000000000000000"){
        console.log("Signer mismatch or invalid signature");
        return false;
    }

    return true;
}

// This function calls the executeTrade function in the smart contract to perform the trade.
async function executeTrade(orderA, orderB, amountA, amountB) {
    console.log("Executing trade...")
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
    orderBook.splice(orderIndex, 1)[0];

    // Notify the matching engine of the removed order
    matchingEngine.postMessage({ type: 'REMOVE_ORDER', order });
}
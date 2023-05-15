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
const bn = (n) => Web3.utils.toBN(n);
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
    console.log("Message from matching engine:", message.type)
    if (message.type === 'MATCH_FOUND') {
        const { orderA, orderB, amountA, amountB } = message;
        // Validate the orders again before executing the trade
        blockNumber = await web3.eth.getBlockNumber();

        Promise.all([
            validateOrder(orderA),
            validateTradeOrder(orderA, amountA, amountB, true),
            validateOrder(orderB),
            validateTradeOrder(orderB, amountB, amountA, true)
        ]).then((results) => {
            if (results[0] && results[1] && results[2] && results[3]) {
                console.log("Orders are valid");
                // Execute the trade on-chain by sending the signed payloads to the smart contract
                if (executeTrade(orderA, orderB, amountA, amountB)) {
                    // Remove the orders from the order book
                    removeCancelledOrder(orderA);
                    removeCancelledOrder(orderB);
                }
            } else {
                if (!results[0] || !results[1]) {
                    console.log("Order A is invalid");
                    removeCancelledOrder(orderA);
                }
                if (!results[2] || !results[3]) {
                    console.log("Order B is invalid");
                    removeCancelledOrder(orderB);
                }
            }
        });
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

async function validateOrder(order, onChainChecks = false) {
    // Check if the parameters are valid (bounds check, expired, improper values, etc.)
    if (
        bn(order.minAmountA).gt(bn(order.maxAmountA)) ||
        bn(order.priceX96).lte(bn(0)) ||
        bn(order.maxSlippage).lt(bn(0)) ||
        bn(order.maxSlippage).gt(bn(10000)) ||
        bn(order.expiration).lte(currentBlockNumber)
    ) {
        console.log("Parameter bounds check failed");
        return false;
    }

    // Perform additional variable checks using web3.js helpers
    if (
        !web3.utils.isAddress(order.user) ||
        !web3.utils.isAddress(order.tokenA) ||
        !web3.utils.isAddress(order.tokenB)
    ) {
        console.log("Not addresses");
        return false;
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
    if (signer !== order.user || signer === "0x0000000000000000000000000000000000000000") {
        console.log("Signer mismatch or invalid signature");
        return false;
    }

    return true;
}

// Check for validity of the trade
async function validateTradeOrder(order, amountA, amountB, checkOnChain = false) {
    try {
        if (bn(amountA).gt(bn(order.maxAmountA)))
        {
            console.log("Amount A too high");
            return false;
        } 
        if (bn(amountA).lt(bn(order.minAmountA))){
            console.log("Amount A too low");
            return false;
        }

        // require(((amountA * order.priceX96) >> 96) * (10000 - order.maxSlippage) <= amountB * 10000, "Price rejected (too much slippage ?)");
        const leftSide = bn(amountA).mul(bn(order.priceX96)).mul(bn(10000).sub(bn(order.maxSlippage)));
        const rightSide = bn(amountB).mul(bn(10000)).mul(bn(2).pow(bn(96)));
        if (leftSide.gt(rightSide)){
            console.log("Price rejected (too much slippage ?)");
            return false;
        }

        if (checkOnChain) {
            const nonce = await contract.methods.nonces(order.user).call();
            if (!bn(order.nonce).eq(bn(nonce))){
                console.log("Nonce mismatch");
                return false;
            }

            // Fetch current balance and allowance for tokenA
            const erc20ABI = JSON.parse(fs.readFileSync('./abi/ERC20.json')).abi;
            const tokenInContract = new web3.eth.Contract(erc20ABI, order.tokenA)
            let tokenBalance = await tokenInContract.methods.balanceOf(order.user).call();
            let tokenAllowance = await tokenInContract.methods.allowance(order.user, contractAddress).call();
            if (bn(tokenBalance).lt(bn(amountA))){
                console.log("Insufficient balance");
                return false;
            }
            if (bn(tokenAllowance).lt(bn(amountA))){
                console.log("Insufficient allowance");
                return false;
            }
        }

    }
    catch (e) {
        console.log("Order validation failed");
        console.log(e);
        return false;
    }

    return true;
}

// This function calls the executeTrade function in the smart contract to perform the trade.
async function executeTrade(orderA, orderB, amountA, amountB) {
    console.log("Executing trade...")
    try {
        // Contract function
        const executeTradeData = contract.methods.executeTrade(
            orderA,
            orderB,
            amountA,
            amountB
        ).encodeABI();

        // Add on-chain trade execution logic here
        const gasPrice = Math.floor(await web3.eth.getGasPrice());
        console.log("Gas price:", gasPrice);

        // Calculate EOA from private key
        const eoa = web3.eth.accounts.privateKeyToAccount(process.env.EOA_PRIVATE_KEY).address;
        console.log("Calculated EOA:", eoa);

        const tx = {
            from: eoa,
            to: contractAddress,
            data: executeTradeData,
            gasPrice,
            gas: 500000, // Hard coded limit. Gas is estimated right after.
        };

        // Fetch current block number
        const blockNumber = await web3.eth.getBlockNumber();
        console.log("Current block number:", blockNumber);

        // Estimate gas required for the transaction
        const gas = await web3.eth.estimateGas(tx);
        console.log("Gas estimate:", gas);
        tx.gasPrice = Math.floor(gasPrice * 1.1);
        tx.gas = Math.floor(gas * 1.1);

        // Send final transaction to the network
        const signedTx = await web3.eth.accounts.signTransaction(tx, process.env.EOA_PRIVATE_KEY);
        await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
        console.log("Transaction sent.");

        // Check if the transaction was successful
        const receipt = await web3.eth.getTransactionReceipt(signedTx.transactionHash);
        if (receipt.status) {
            console.log("Transaction successful");
            return true;
        } else {
            console.log("Transaction failed");
            return false;
        }
    } catch (e) {
        console.log("Trade execution failed:", e);
        return false;
    }
}

// This function processes a trade cancellation. Either by smart contract nonce increase or by local invalidation.
async function removeCancelledOrder(order) {
    const orderIndex = orderBook.findIndex((o) => o.id === order.id);
    orderBook.splice(orderIndex, 1)[0];

    // Notify the matching engine of the removed order
    matchingEngine.postMessage({ type: 'REMOVE_ORDER', order });
}
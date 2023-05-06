const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Worker } = require('worker_threads');
const Web3 = require('web3');
const dotenv = require('dotenv');

dotenv.config();
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Order book
const orderBook = [];
// Cancellation list
const cancellations = [];

// Matching engine worker
const matchingEngine = new Worker('./matchingEngine.js');

// Web3 setup
const web3 = new Web3(process.env.NODE_RPC_URL);
const contractABI = require('./abi/OrderBookExchange.json');
const contractAddress = process.env.CONTRACT_ADDRESS; // Add your contract address to '.env'
const contract = new web3.eth.Contract(contractABI, contractAddress);

// API endpoints
app.post('/api/orders', (req, res) => {
  const order = req.body;

  // Validate the order before adding it to the order book
  if (validateOrder(order)) {
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

      // Remove the cancelled order from the order book
      const orderIndex = orderBook.findIndex(
        (order) => order.user === user && order.nonce === nonce
      );
      if (orderIndex !== -1) {
        const order = orderBook.splice(orderIndex, 1)[0];

        // Notify the matching engine of the removed order
        matchingEngine.postMessage({ type: 'REMOVE_ORDER', order });
      }
    }
  });
}, 30000); // Check every 30 seconds

// Listen for messages from the matching engine
matchingEngine.on('message', (message) => {
  if (message.type === 'MATCH_FOUND') {
    const { orderA, orderB } = message;

    // Execute the trade on-chain by sending the signed payloads to the smart contract
    executeTrade(orderA, orderB);

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

function validateOrder(order) {
  // Verify the order signature
  const messageHash = web3.utils.soliditySha3(
    { t: 'address', v: order.user },
    { t: 'address', v: order.tokenA },
    { t: 'address', v: order.tokenB },
    { t: 'uint256', v: order.minAmountA },
    { t: 'uint256', v: order.maxAmountA },
    { t: 'uint256', v: order.price },
    { t: 'uint256', v: order.maxSlippage },
    { t: 'uint256', v: order.nonce },
    { t: 'uint256', v: order.expiration }
  );

  const signer = web3.eth.accounts.recover(
    messageHash,
    order.signature.v,
    order.signature.r,
    order.signature.s
  );

  return signer === order.user;
}

async function executeTrade(orderA, orderB) {
  // Add on-chain trade execution logic here
  const gasPrice = await web3.eth.getGasPrice();

  const executeTradeData = contract.methods.executeTrade(
    orderA,
    orderB,
    orderA.signature.v,
    orderA.signature.r,
    orderA.signature.s,
    orderB.signature.v,
    orderB.signature.r,
    orderB.signature.s
  ).encodeABI();

  const tx = {
    from: orderA.user,
    to: contractAddress,
    data: executeTradeData,
    gasPrice,
    gas: 300000, // TODO: Estimate the gas required for the transaction
  };

  const signedTx = await web3.eth.accounts.signTransaction(tx, process.env.PRIVATE_KEY);

  await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
}
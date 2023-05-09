const { parentPort } = require('worker_threads');

const orderBook = [];
let blockNumber = 0;

parentPort.on('message', (message) => {
    if (message.type === 'ADD_ORDER') {
        console.log("Order added:", message.order);
        orderBook.push(message.order);
        matchOrders();
    } else if (message.type === 'REMOVE_ORDER') {
        console.log("Order removed:", message.order);
        const index = orderBook.findIndex((order) => order.id === message.order.id);
        if (index !== -1) {
            orderBook.splice(index, 1);
        }
    } else if (message.type === 'UPDATE_BLOCK_NUMBER') {
        console.log("Block number updated:", message.blockNumber);
        blockNumber = message.blockNumber;
    }
});

function matchOrders() {
    // Loop through all orders in the order book and check if any two orders can be matched
    for (let i = 0; i < orderBook.length; i++) {
        for (let j = i + 1; j < orderBook.length; j++) {
            const orderA = orderBook[i];
            const orderB = orderBook[j];

            if (
                orderA.tokenA === orderB.tokenB &&
                orderA.tokenB === orderB.tokenA &&
                isPriceMatch(orderA, orderB)
            ) {
                console.log("Match found:", orderA, orderB);
                parentPort.postMessage({ type: 'MATCH_FOUND', orderA, orderB, });
                return;
            }
        }
    }
}

function isPriceMatch(orderA, orderB) {
    // This function checks if the two orders can be matched based on their specified prices and slippage
    // Slippage in the favorable direction is always allowed for either party.
    const priceA = orderA.price >> 96; // Apply bitwise right-shift by 96
    const priceB = orderB.price >> 96; // Apply bitwise right-shift by 96

    // Check if orderB's most generous price is acceptable to orderA
    // Most generous price is highest price seen by userA (he gets most "out" tokens for a given "in" tokens)
    // Highest price for userA is lowest price for userB, because userA sees 1/orderB.price as the price
    // const invPriceB = 2 ** 92 / priceB;
    const minInvPriceB = 2 ** 96 * 10000 / ((10000 - orderB.maxSlippage) * priceB);
    const validA = minInvPriceB >= priceA * (10000 - orderA.maxSlippage / 10000);

    // Check if orderA's most generous price is acceptable to orderB
    const minInvPriceA = 2 ** 96 * 10000 / ((10000 - orderA.maxSlippage) * priceA);
    const validB = minInvPriceA >= priceB * (10000 - orderB.maxSlippage / 10000);

    return validA && validB;
}
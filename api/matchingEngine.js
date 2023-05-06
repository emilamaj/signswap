const { parentPort } = require('worker_threads');

const orderBook = [];

parentPort.on('message', (message) => {
    if (message.type === 'ADD_ORDER') {
        orderBook.push(message.order);
        matchOrders();
    } else if (message.type === 'REMOVE_ORDER') {
        const index = orderBook.findIndex((order) => order.id === message.order.id);
        if (index !== -1) {
            orderBook.splice(index, 1);
        }
    }
});

function matchOrders() {
    for (let i = 0; i < orderBook.length; i++) {
        for (let j = i + 1; j < orderBook.length; j++) {
            const orderA = orderBook[i];
            const orderB = orderBook[j];

            if (
                orderA.tokenA === orderB.tokenB &&
                orderA.tokenB === orderB.tokenA &&
                isPriceMatch(orderA, orderB)
            ) {
                parentPort.postMessage({
                    type: 'MATCH_FOUND',
                    orderA,
                    orderB,
                });

                return;
            }
        }
    }
}

function isPriceMatch(orderA, orderB) {
    const priceA = orderA.price; // Price of tokenA in terms of tokenB, calculated by dividing tokenB by tokenA
    const priceB = orderB.price; // Price of tokenB in terms of tokenA

    const invPriceA = 1 / priceA; // Inverse price of tokenA in terms of tokenB, calculated by dividing 1 by the price
    const invPriceB = 1 / priceB;

    // Check if the prices match within the allowed slippage.
    const validA = invPriceB >= priceA * (1 - orderA.maxSlippage / 100) && invPriceB <= priceA * (1 + orderA.maxSlippage / 100);
    const validB = invPriceA >= priceB * (1 - orderB.maxSlippage / 100) && invPriceA <= priceB * (1 + orderB.maxSlippage / 100);

    return validA && validB;
}

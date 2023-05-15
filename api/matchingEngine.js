const Web3 = require('web3');
const { parentPort } = require('worker_threads');

const orderBook = [];
let blockNumber = 0;

// Alias for Web3.utils.toBN
const bn = (n) => Web3.utils.toBN(n);

parentPort.on('message', (message) => {
    if (message.type === 'ADD_ORDER') {
        console.log("Matching engine received order id:", message.order.id);
        orderBook.push(message.order);
    } else if (message.type === 'REMOVE_ORDER') {
        console.log("Order removed:", message.order.id);
        const index = orderBook.findIndex((order) => order.id === message.order.id);
        if (index !== -1) {
            orderBook.splice(index, 1);
        }
    } else if (message.type === 'UPDATE_BLOCK_NUMBER') {
        console.log("Block number updated:", message.blockNumber);
        blockNumber = message.blockNumber;
    }
});

// Periodically check for matches
setInterval(() => {
    console.log("Checking for matches...");
    matchOrders();
}, 5000); // Check every second

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
                // Calculate the amount of tokens to swap
                const { amountA, amountB } = findAmounts_simple(orderA, orderB);
                console.log("Amounts A/B:", amountA.toString(), amountB.toString());
                if (checkTradeSimple(orderA, amountA, amountB) && checkTradeSimple(orderB, amountB, amountA)) {
                    // Send a message to the main thread
                    parentPort.postMessage({ type: 'MATCH_FOUND', orderA, orderB, amountA: amountA.toString(), amountB: amountB.toString() });
                    return;
                } else {
                    console.log("Price matched but trade params invalid.");
                }
            } else {
                console.log("No match found");
            }
        }
    }
}

function isPriceMatch(orderA, orderB) {
    // This function checks if the two orders can be matched based on their specified prices and slippage
    // Slippage in the favorable direction is always allowed for either party.
    const priceA = bn(orderA.priceX96).shrn(96); // Apply bitwise right-shift by 96
    const priceB = bn(orderB.priceX96).shrn(96); // Apply bitwise right-shift by 96

    // Check if orderB's most generous price is acceptable to orderA
    // Most generous price is highest price seen by userA (he gets most "out" tokens for a given "in" tokens)
    // Highest price for userA is lowest price for userB, because userA sees 1/orderB.price as the price
    const minInvPriceB = bn(2).pow(bn(96)).mul(bn(10000)).div(bn(10000).sub(bn(orderB.maxSlippage)).mul(priceB));
    const priceValidA = minInvPriceB.gte(priceA.mul(bn(10000).sub(bn(orderA.maxSlippage)).div(bn(10000))));

    // Check if orderA's most generous price is acceptable to orderB
    const minInvPriceA = bn(2).pow(bn(96)).mul(bn(10000)).div(bn(10000).sub(bn(orderA.maxSlippage)).mul(priceA));
    const priceValidB = minInvPriceA.gte(priceB.mul(bn(10000).sub(bn(orderB.maxSlippage)).div(bn(10000))));

    return priceValidA && priceValidB;
}

// Check only bounds and slippage.
function checkTradeSimple(order, amountA, amountB) {
    if (amountA.gt(bn(order.maxAmountA))){
        console.log("AmountA: ", amountA.toString());
        console.log("AmountA too high");
        return false;
    }
    if (amountA.lt(bn(order.minAmountA))) {
        console.log("AmountA: ", amountA.toString());
        console.log("AmountA too low");
        return false;
    }

    // require(
    //     ((amountA * order.priceX96) >> 96) * (10000 - order.maxSlippage) <=
    //         amountB * 10000,
    //     "Price rejected (too much slippage ?)"
    // );
    const leftSide = bn(amountA).mul(bn(order.priceX96)).mul(bn(10000).sub(bn(order.maxSlippage)));
    const rightSide = bn(amountB).mul(bn(10000)).mul(bn(2).pow(bn(96)));
    if (leftSide.gt(rightSide)) return false;

    return true;
}

// Simple algorithm to find satisfying amounts of tokens for both orders. Needs to be improved. 
function findAmounts_simple(order1, order2) { // Garbage, throw away asap.
    //NOTE: /!\ Beware of the bad naming conventions. Needs to be fixed !!!

    // Calculate trade price: average between the two worst-case prices
    // Values are either represented as relative values or absolute values (relative to own pricing, or in absolute tokenA/tokenB of order1)
    // In the context of order2, minPrice = price * (1 - maxSlippageB) = tokenA/tokenB * (1 - maxSlippageB)
    // console.log("Price 1r: ", order1.priceX96.toString());
    const minPrice1r = bn(order1.priceX96).mul(bn(10000 - order1.maxSlippage)).div(bn(10000));
    // console.log("Min price 1r: ", minPrice1r.toString());
    const minPrice2r = bn(order2.priceX96).mul(bn(10000 - order2.maxSlippage)).div(bn(10000));
    // console.log("Min price 2r: ", minPrice2r.toString());
    const maxPrice2a = bn(2).pow(bn(192)).div(minPrice2r);
    // console.log("Max price 2a: ", maxPrice2a.toString());
    const pa = minPrice1r.add(maxPrice2a).div(bn(2));
    // console.log("Found price: ", pa.toString());

    // Calculate the amount of tokenA to swap. Must be between minAmountA and maxAmountA
    const maxAmountA1a = bn(order1.maxAmountA);
    const maxAmountBr = bn(order2.maxAmountA);
    const maxAmountA2a = maxAmountBr.mul(bn(2).pow(bn(96))).div(pa);
    // Select the highest amount of tokenA to swap (but still <= to both maxAmounts)
    amountA = maxAmountA1a.lt(maxAmountA2a) ? maxAmountA1a : maxAmountA2a;
    // Use price to calculate the amount of tokenB to swap
    amountB = amountA.mul(pa).div(bn(2).pow(bn(96)));

    return { amountA, amountB };
}
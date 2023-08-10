// This smart contract is used to serve as an intermediary between Uniswap V2 and orders of the users.
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../lib/openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";

interface IUniswapV2Pair {
    function swap(
        uint amount0Out,
        uint amount1Out,
        address to,
        bytes calldata data
    ) external;
}

struct Order {
    address user;
    address tokenA;
    address tokenB;
    uint256 minAmountA;
    uint256 maxAmountA;
    uint256 priceX96; // price = priceX96 >> 96
    uint256 maxSlippage; // in bips (1 bip = 0.01% = 0.0001 = 1/10000)
    uint256 nonce;
    uint256 expiration; // Must have block.number <= expiration to be valid.
    uint256 code; // Contract version identification code.
    bytes signature;
}

interface IOrderBookExchange {
    function executeTrade(
        Order memory orderA,
        Order memory orderB,
        uint256 amountA,
        uint256 amountB
    ) external;
}

contract InternalTrade {
    address public immutable owner;

    constructor() {
        owner = msg.sender;
    }


    modifier onlyOwner() {
        require(
            msg.sender == owner,
            "InternalTrade: Only owner can call this function."
        );
        _;
    }


    function withdraw(address token, uint amount) external onlyOwner {
        IERC20(token).transfer(owner, amount);
    }


    // Take opposing side of the trade by borrowing the funds from Uniswap.
    function tradeFlashV2(
        address _pairAddress,
        uint256 amount0Out,
        uint256 amount1Out,
        address exchangeAddress,
        Order memory orderA,
        Order memory orderB,
        uint256 amountA,
        uint256 amountB,
        uint256 amountC
    ) external onlyOwner {
        /* 
        Note: It is assumed that orderA is the hand-crafted internal order, and orderB is the order from the user.
        amountA is the amount we will transfer to userB
        amountB is the amount userB will transfer to us
        amountC is the amount we pay back to Uniswap (we pocket the difference between amountA and amountC)
        */

        // Pack the parameters into a single bytes variable to be forwarded to the callback function. Must be done manually because Solidity does not support structs as arguments.
        bytes memory data = abi.encode(
            exchangeAddress,
            orderA,
            orderB,
            amountA,
            amountB,
            amountC
        );

        // Intiate the flash swap
        IUniswapV2Pair(_pairAddress).swap(
            amount0Out,
            amount1Out,
            address(this),
            data
        );
    }

    // Callback function used by Uniswap V2. This is where the trade is executed, and the loan is repaid.
    function uniswapV2Call(
        address,
        uint,
        uint,
        bytes calldata data
    ) external {
        // Checks
        require(tx.origin == owner, "InternalTrade: Only owner can call this function.");

        // Unpack data
        (
            address exchangeAddress,
            Order memory orderA,
            Order memory orderB,
            uint256 amountA,
            uint256 amountB,
            uint256 amountC
        ) = abi.decode(data, (address, Order, Order, uint256, uint256, uint256));

        // Grant approval to the exchange contract to spend the tokens, if not already done.
        IERC20(orderA.tokenA).approve(exchangeAddress, amountA);

        // Execute trade
        IOrderBookExchange(exchangeAddress).executeTrade(
            orderA,
            orderB,
            amountA,
            amountB
        );

        // Repay loan
        IERC20(orderA.tokenA).transfer(msg.sender, amountC);
    }
}
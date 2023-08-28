// This smart contract is used to serve as an intermediary between Uniswap V2 and orders of the users.
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../lib/openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import "../src/OrderBookExchange.sol";

interface IUniswapV2Pair {
    function swap(
        uint amount0Out,
        uint amount1Out,
        address to,
        bytes calldata data
    ) external;
}

contract InternalTrade {
    address public immutable owner;

    constructor(address _owner) {
        owner = _owner;
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
        OrderBookExchange.Order memory orderA,
        OrderBookExchange.Order memory orderB,
        uint256 amountA,
        uint256 amountB,
        uint256 amountC
    ) external onlyOwner {
        /* 
        Note: It is assumed that orderA is the hand-crafted internal order, and orderB is the order from the user.
        amountA is the amount we (the pool) will transfer to userB
        amountB is the amount userB will transfer to userA
        amountC is the amount of tokenB we pay back to Uniswap (to repay the loan in tokenA)
        amountB - amountC is the amount of tokenB we keep for ourselves.
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

        // Intiate the flash swap. Send the funds to UserA so that he can execute the trade.
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
        // Unpack data
        (
            address exchangeAddress,
            OrderBookExchange.Order memory orderA,
            OrderBookExchange.Order memory orderB,
            uint256 amountA,
            uint256 amountB,
            uint256 amountC
        ) = abi.decode(data, (address, OrderBookExchange.Order, OrderBookExchange.Order, uint256, uint256, uint256));

        // Transfer tokens to userA first.
        IERC20(orderA.tokenA).transfer(orderA.user, amountA);

        // Grant approval to the exchange contract to spend the tokens, if not already done.
        IERC20(orderA.tokenA).approve(exchangeAddress, amountA);

        // Execute trade
        OrderBookExchange(exchangeAddress).executeTrade(
            orderA,
            orderB,
            amountA,
            amountB
        );
        // ...The exchange contract has now transferred amountB of tokenB to userA.
        
        // Repay loan to the calling pool.
        IERC20(orderA.tokenB).transferFrom(orderA.user, msg.sender, amountC);

        // Send difference to owner
        IERC20(orderA.tokenB).transferFrom(orderA.user, owner, amountB - amountC);
    }
}
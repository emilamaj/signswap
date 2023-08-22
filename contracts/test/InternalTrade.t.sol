// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "../lib/forge-std/src/Test.sol";
import "../lib/forge-std/src/console.sol";
import "../src/OrderBookExchange.sol";
import "../src/InternalTrade.sol";
import "../lib/openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";

interface IUniswapV2Callee {
    function uniswapV2Call(
        address sender,
        uint amount0,
        uint amount1,
        bytes calldata data
    ) external;
}

contract mockToken is ERC20 {
    constructor(string memory name, string memory symbol) ERC20(name, symbol) {
        _mint(msg.sender, 1000 ether);
    }
}

contract mockPool {
    address public token0;
    address public token1;

    uint private reserve0;
    uint private reserve1;

    // Set the pool tokens
    constructor(address _token0, address _token1){
        token0 = _token0;
        token1 = _token1;
    }

    // Init the reserveN variables with the amount of tokens in the pool
    function init() external {
        reserve0 = ERC20(token0).balanceOf(address(this));
        reserve1 = ERC20(token1).balanceOf(address(this));
    }

    // Swap function, with non-essential parts removed
    function swap(
        uint amount0Out,
        uint amount1Out,
        address to,
        bytes calldata data
    ) external {
        require(
            amount0Out > 0 || amount1Out > 0,
            "UniswapV2: INSUFFICIENT_OUTPUT_AMOUNT"
        );
        (uint _reserve0, uint _reserve1) = (reserve0, reserve1); // gas savings
        require(
            amount0Out < _reserve0 && amount1Out < _reserve1,
            "UniswapV2: INSUFFICIENT_LIQUIDITY"
        );

        uint balance0;
        uint balance1;
        {
            // scope for _token{0,1}, avoids stack too deep errors
            address _token0 = token0;
            address _token1 = token1;
            require(to != _token0 && to != _token1, "UniswapV2: INVALID_TO");
            if (amount0Out > 0) IERC20(_token0).transfer(to, amount0Out); // optimistically transfer tokens
            if (amount1Out > 0) IERC20(_token1).transfer(to, amount1Out); // optimistically transfer tokens
            if (data.length > 0)
                IUniswapV2Callee(to).uniswapV2Call(
                    msg.sender,
                    amount0Out,
                    amount1Out,
                    data
                );
            balance0 = IERC20(_token0).balanceOf(address(this));
            balance1 = IERC20(_token1).balanceOf(address(this));
        }
        uint amount0In = balance0 > _reserve0 - amount0Out
            ? balance0 - (_reserve0 - amount0Out)
            : 0;
        uint amount1In = balance1 > _reserve1 - amount1Out
            ? balance1 - (_reserve1 - amount1Out)
            : 0;
        require(
            amount0In > 0 || amount1In > 0,
            "UniswapV2: INSUFFICIENT_INPUT_AMOUNT"
        );
        {
            // scope for reserve{0,1}Adjusted, avoids stack too deep errors
            uint balance0Adjusted = (balance0 * 1000) - (amount0In * 3);
            uint balance1Adjusted = (balance1 * 1000) - (amount1In * 3);
            require(
                balance0Adjusted * balance1Adjusted >=
                    _reserve0 * _reserve1 * 1000 ** 2,
                "UniswapV2: K"
            );
        }

        // _update(balance0, balance1, _reserve0, _reserve1);
        reserve0 = uint(balance0);
        reserve1 = uint(balance1);
    }

    // Helper function to calculate the amount of tokens to swap to get an exact amount of tokens
    function getExactInput(
        uint amountOut,
        bool zeroForOne
    ) external view returns (uint amountIn) {
        (uint _reserve0, uint _reserve1) = (reserve0, reserve1);
        require(amountOut > 0, "UniswapV2Library: INSUFFICIENT_OUTPUT_AMOUNT");
        require(
            _reserve0 > 0 && _reserve1 > 0,
            "UniswapV2Library: INSUFFICIENT_LIQUIDITY"
        );

        if (zeroForOne) {
            amountIn = 1 + (_reserve0*amountOut*1000)/((_reserve1 - amountOut) * 997);
        } else {
            amountIn = 1 + (_reserve1*amountOut*1000)/((_reserve0 - amountOut) * 997);
        }
    }

    // Calculate the output from a given input of tokens
    function getExactOutput(
        uint amountIn,
        bool zeroForOne
    ) external view returns (uint amountOut) {
        (uint _reserve0, uint _reserve1) = (reserve0, reserve1);
        require(amountIn > 0, "UniswapV2Library: INSUFFICIENT_INPUT_AMOUNT");
        require(
            _reserve0 > 0 && _reserve1 > 0,
            "UniswapV2Library: INSUFFICIENT_LIQUIDITY"
        );

        if (zeroForOne) {
            uint dx = amountIn * 997;
            amountOut = (dx * _reserve1) / (_reserve0 * 1000 + dx);
        } else {
            uint dy = amountIn * 997;
            amountOut = (dy * _reserve0) / (_reserve1 * 1000 + dy);
        }
    }
}

contract InternalTradeTest is Test {
    OrderBookExchange exchangeContract;
    InternalTrade internalTradeContract;
    ERC20 tokenA;
    ERC20 tokenB;
    mockPool poolContract;

    // The setup function is called automatically by Forge before every test function.
    function setUp() public {
        // Deploy the contracts
        exchangeContract = new OrderBookExchange();
        internalTradeContract = new InternalTrade();

        // Deploy Tokens
        tokenA = new mockToken("TokenA", "TKA");
        tokenB = new mockToken("TokenB", "TKB");

        // Deploy pool, fund it with tokens and init it
        poolContract = new mockPool(address(tokenA), address(tokenB));
        tokenA.transfer(address(poolContract), 200 ether);
        tokenB.transfer(address(poolContract), 100 ether);
        poolContract.init();
    }

    // This function takes the parameters of an order and generates the signature.
    function _generateSignedOrder(
        OrderBookExchange.Order memory order,
        uint256 privateKey
    ) private pure returns (OrderBookExchange.Order memory) {
        // Generate the user address
        address user = vm.addr(privateKey);

        // Generate the signature
        bytes32 messageHash = keccak256(
            abi.encodePacked(
                user,
                order.tokenA,
                order.tokenB,
                order.minAmountA,
                order.maxAmountA,
                order.priceX96,
                order.maxSlippage,
                order.nonce,
                order.expiration,
                order.code
            )
        );

        messageHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash)
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, messageHash);

        // Save the signature
        bytes memory signature = abi.encodePacked(r, s, v);

        // Create the final order
        return
            OrderBookExchange.Order(
                user,
                order.tokenA,
                order.tokenB,
                order.minAmountA,
                order.maxAmountA,
                order.priceX96,
                order.maxSlippage,
                order.nonce,
                order.expiration,
                order.code,
                signature
            );
    }

    // This function generates a stub order. If direct is true, sell tokenA for tokenB.
    function orderStub(
        bool direct
    ) public view returns (OrderBookExchange.Order memory) {
        return
            OrderBookExchange.Order(
                address(0), // This field is replaced by the signing function
                direct ? address(tokenA) : address(tokenB),
                direct ? address(tokenB) : address(tokenA),
                1 ether, // minAmountA
                1 ether,
                1 << 96, // priceX96 of 1 (neutral price)
                0, // maxSlippage
                0, // nonce, always
                block.number + 100,
                0x01,
                "" // This is the signature
            );
    }

    // Test basic order matching
    function test_flashV2_basic() public {
        console.log(tx.origin);
        console.log(msg.sender);
        console.log(address(this));

        // Generate the orders
        OrderBookExchange.Order memory orderA = orderStub(true);
        OrderBookExchange.Order memory orderB = orderStub(false);

        // Generate the signatures
        orderA = _generateSignedOrder(orderA, 0x0A); // PK of userA is 0x0A
        orderB = _generateSignedOrder(orderB, 0x0B); // PK of userB is 0x0B

        // Fund the users with tokens, approve the exchange contract to spend them
        // - User B gets 1 ether of tokenB
        // - User A DOES NOT GET 1 ether of tokenA (loans from the pool)
        // The exchange contract must be approved to spend the tokens.
        // The internal trade contract must be approved to claw back some tokens from user A to repay the pool.
        tokenB.transfer(orderB.user, 1 ether);
        vm.prank(orderA.user); // EVM cheatcode: spoof the sender of the next CALL.
        tokenA.approve(address(exchangeContract), 1 ether);
        vm.prank(orderB.user);
        tokenB.approve(address(exchangeContract), 1 ether);
        vm.prank(orderA.user);
        tokenB.approve(address(internalTradeContract), 1 ether);

        // Set the trade parameters:
        // - User B has 1 tokenB and wants 1 tokenA
        // - User A has 0 tokenA and 0 tokenB, but:
        //     - Uniswap pool has 200 tokenA and 100 tokenB
        //     - Uniswap sends 1 tokenA to User B, loaned by user A (it's user A who will repay)
        //     - ...
        //     - User A repays the loan with ~0.5 tokenB
        uint amount0Out = 1 ether; // 1 tokenA, to be sent to User B. User A will need to repay ~0.5 tokenB to the pool.
        uint amount1Out = 0;
        uint amountC = poolContract.getExactInput(1 ether, false); // User B pays 1 tokenB to User A, who will repay ~0.5 tokenB to the pool.
        console.log("Pool exact input: ", amountC);

        // Execute the trade
        internalTradeContract.tradeFlashV2(
            address(poolContract),
            amount0Out,
            amount1Out,
            address(exchangeContract),
            orderA,
            orderB,
            1 ether,
            1 ether,
            amountC
        );

        // Check the balances
        console.log("User A balance A: ", tokenA.balanceOf(address(orderA.user)));
        console.log("User A balance B: ", tokenB.balanceOf(address(orderA.user)));
        console.log("User B balance A: ", tokenA.balanceOf(address(orderB.user)));
        console.log("User B balance B: ", tokenB.balanceOf(address(orderB.user)));
        console.log("Pool balance A: ", tokenA.balanceOf(address(poolContract)));
        console.log("Pool balance B: ", tokenB.balanceOf(address(poolContract)));
        assertEq(tokenA.balanceOf(address(orderA.user)), 1 ether);
        assertEq(tokenB.balanceOf(address(orderB.user)), 1 ether);
    }
}

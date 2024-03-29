// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "../lib/forge-std/src/Test.sol";
import "../lib/forge-std/src/console.sol";
import "../src/OrderBookExchange.sol";
import "../lib/openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";

contract mockToken is ERC20 {
    constructor(string memory name, string memory symbol) ERC20(name, symbol) {
        _mint(msg.sender, 1000 ether);
    }
}

contract OrderBookExchangeTest is Test {
    OrderBookExchange exchangeContract;
    ERC20 tokenA;
    ERC20 tokenB;

    // In each Foundry test, the setUp() function is called before each test. Tests are independent of each other.
    function setUp() public {
        // Deploy the NFT contract
        exchangeContract = new OrderBookExchange();

        // Deploy Tokens
        tokenA = new mockToken("TokenA", "TKA");
        tokenB = new mockToken("TokenB", "TKB");
    }

    // This function takes the parameters of an order and generates the signature. The user value provided is replaced by the address derived from the PK.
    function _generateSignedOrder(
        OrderBookExchange.Order memory order,
        uint256 privateKey
    ) public pure returns (OrderBookExchange.Order memory) {
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

    // Test the cancelling of an order.
    function test_cancelOrder() public {
        // Read the nonce before the call
        uint256 nonce = exchangeContract.nonces(address(this));

        exchangeContract.cancelOrder();

        // Read the nonce after the call
        uint256 nonce2 = exchangeContract.nonces(address(this));

        // Check that the nonce has been incremented
        assertEq(nonce2, nonce + 1);
    }

    // Test the matching of two orders with a trivial price. (Remember that real_price = priceX69 >> 96)
    function test_trivialPrice() public {
        // Generate the orders
        OrderBookExchange.Order memory order1 = orderStub(true);
        OrderBookExchange.Order memory order2 = orderStub(false);

        // Generate the signed orders
        OrderBookExchange.Order memory signedOrder1 = _generateSignedOrder(
            order1,
            0x0A // Private key of user1
        );
        OrderBookExchange.Order memory signedOrder2 = _generateSignedOrder(
            order2,
            0x0B // Private key of user2
        );

        // Fund the users now that we have generated their addresses
        tokenA.transfer(signedOrder1.user, 2 ether);
        tokenB.transfer(signedOrder2.user, 2 ether);

        // Approve the exchange contract to spend the tokens. Need to spoof the msg.sender to be the user.
        vm.prank(signedOrder1.user);
        tokenA.approve(address(exchangeContract), 2 ether);
        vm.prank(signedOrder2.user);
        tokenB.approve(address(exchangeContract), 2 ether);

        // Submit the orders. The amount is 1 ether for both directions (ok, since both prices are exactly 1)
        exchangeContract.executeTrade(
            signedOrder1,
            signedOrder2,
            1 ether,
            1 ether
        );

        // Check that the orders have been matched
        assertEq(tokenA.balanceOf(signedOrder1.user), 1 ether);
        assertEq(tokenB.balanceOf(signedOrder2.user), 1 ether);
    }

    // Price diff=10%, slippageA is 5%, slippageB is 10%. The trade should be allowed.
    function test_case0() public {
    }

    // Price diff=5%, slippageA is 1%, slippageB is 10%. Price is favorable for userA, so userA's tigher slippage is ignored.
    function test_case1() public {
    }

    // Same price=1, slippage=0%, but orderA.minAmountA = 2 ether, and orderB.maxAmountA = 1 ether. The trade should NOT be allowed.
    function test_case2_invalid() public {
    }

    // Test the matching of orders with an obvious invalid price.
    function test_trivialInvalidPrice() public {
        // Generate the orders
        OrderBookExchange.Order memory order1 = orderStub(true);
        OrderBookExchange.Order memory order2 = orderStub(false);

        // Set invalid prices
        order1.priceX96 = 2 << 96;
        order2.priceX96 = 1 << 96;

        // Generate the signed orders
        OrderBookExchange.Order memory signedOrder1 = _generateSignedOrder(
            order1,
            0x0A
        );
        OrderBookExchange.Order memory signedOrder2 = _generateSignedOrder(
            order2,
            0x0B
        );

        // Fund the users now that we have generated their addresses
        tokenA.transfer(signedOrder1.user, 2 ether);
        tokenB.transfer(signedOrder2.user, 2 ether);

        // Approve the exchange contract to spend the tokens
        vm.prank(signedOrder1.user);
        tokenA.approve(address(exchangeContract), 2 ether);
        vm.prank(signedOrder2.user);
        tokenB.approve(address(exchangeContract), 2 ether);

        // Expect the transaction to revert due to invalid prices
        vm.expectRevert();
        exchangeContract.executeTrade(
            signedOrder1,
            signedOrder2,
            1 ether,
            1 ether
        );
    }

    // Test with trade amounts outside of bounds.
    function test_invalidAmounts() public {
        // Generate the orders
        OrderBookExchange.Order memory order1 = orderStub(true);
        OrderBookExchange.Order memory order2 = orderStub(false);

        // Generate the signed orders
        OrderBookExchange.Order memory signedOrder1 = _generateSignedOrder(
            order1,
            0x0A
        );
        OrderBookExchange.Order memory signedOrder2 = _generateSignedOrder(
            order2,
            0x0B
        );

        // Fund the users now that we have generated their addresses
        tokenA.transfer(signedOrder1.user, 2 ether);
        tokenB.transfer(signedOrder2.user, 2 ether);

        // Approve the exchange contract to spend the tokens
        vm.prank(signedOrder1.user);
        tokenA.approve(address(exchangeContract), 2 ether);
        vm.prank(signedOrder2.user);
        tokenB.approve(address(exchangeContract), 2 ether);

        // Expect the transaction to revert due to invalid amounts
        vm.expectRevert();
        exchangeContract.executeTrade(
            signedOrder1,
            signedOrder2,
            0.5 ether,
            1 ether
        );
        vm.expectRevert();
        exchangeContract.executeTrade(
            signedOrder1,
            signedOrder2,
            1.5 ether,
            1 ether
        );
    }

    // Test trade with an old nonce.
    function test_oldNonce() public {
        // Generate the orders
        OrderBookExchange.Order memory order1 = orderStub(true);
        OrderBookExchange.Order memory order2 = orderStub(false);

        // Generate the signed orders
        OrderBookExchange.Order memory signedOrder1 = _generateSignedOrder(
            order1,
            0x0A
        );
        OrderBookExchange.Order memory signedOrder2 = _generateSignedOrder(
            order2,
            0x0B
        );

        // Cancel order for user1 (increase nonce on the contract)
        vm.prank(signedOrder1.user);
        exchangeContract.cancelOrder();

        // Fund the users now that we have generated their addresses
        tokenA.transfer(signedOrder1.user, 2 ether);
        tokenB.transfer(signedOrder2.user, 2 ether);

        // Approve the exchange contract to spend the tokens. Need to spoof the msg.sender to be the user.
        vm.prank(signedOrder1.user);
        tokenA.approve(address(exchangeContract), 2 ether);
        vm.prank(signedOrder2.user);
        tokenB.approve(address(exchangeContract), 2 ether);

        // Expect the transaction to revert due to old nonce
        vm.expectRevert();
        exchangeContract.executeTrade(
            signedOrder1,
            signedOrder2,
            1 ether,
            1 ether
        );
    }

    // Test trade with an expired order.
    function test_expiredOrder() public {
        // Generate the orders
        OrderBookExchange.Order memory order1 = orderStub(true);
        OrderBookExchange.Order memory order2 = orderStub(false);

        // Set expiration to a past block for user1
        order1.expiration = block.number - 1;

        // Generate the signed orders
        OrderBookExchange.Order memory signedOrder1 = _generateSignedOrder(
            order1,
            0x0A
        );
        OrderBookExchange.Order memory signedOrder2 = _generateSignedOrder(
            order2,
            0x0B
        );

        // Fund the users now that we have generated their addresses
        tokenA.transfer(signedOrder1.user, 2 ether);
        tokenB.transfer(signedOrder2.user, 2 ether);

        // Approve the exchange contract to spend the tokens
        vm.prank(signedOrder1.user);
        tokenA.approve(address(exchangeContract), 2 ether);
        vm.prank(signedOrder2.user);
        tokenB.approve(address(exchangeContract), 2 ether);

        // Expect the transaction to revert due to expired orders
        vm.expectRevert();
        exchangeContract.executeTrade(
            signedOrder1,
            signedOrder2,
            1 ether,
            1 ether
        );
    }

    // Test order with a different contract identifier code.
    function test_invalidCode() public {
        // Generate the orders
        OrderBookExchange.Order memory order1 = orderStub(true);
        OrderBookExchange.Order memory order2 = orderStub(false);

        // Set invalid code for user1
        order1.code = 0x02;

        // Generate the signed orders
        OrderBookExchange.Order memory signedOrder1 = _generateSignedOrder(
            order1,
            0x0A
        );
        OrderBookExchange.Order memory signedOrder2 = _generateSignedOrder(
            order2,
            0x0B
        );

        // Fund the users now that we have generated their addresses
        tokenA.transfer(signedOrder1.user, 2 ether);
        tokenB.transfer(signedOrder2.user, 2 ether);

        // Approve the exchange contract to spend the tokens
        vm.prank(signedOrder1.user);
        tokenA.approve(address(exchangeContract), 2 ether);
        vm.prank(signedOrder2.user);
        tokenB.approve(address(exchangeContract), 2 ether);

        // Expect the transaction to revert due to invalid code
        vm.expectRevert();
        exchangeContract.executeTrade(
            signedOrder1,
            signedOrder2,
            1 ether,
            1 ether
        );
    }

    // Test trade with an invalid signature.
    function test_invalidSignature() public {
        // Generate the orders
        OrderBookExchange.Order memory order1 = orderStub(true);
        OrderBookExchange.Order memory order2 = orderStub(false);

        // Generate the signed orders
        OrderBookExchange.Order memory signedOrder1 = _generateSignedOrder(
            order1,
            0x0A
        );
        OrderBookExchange.Order memory signedOrder2 = _generateSignedOrder(
            order2,
            0x0B
        );

        // Modify the signature to make them invalid
        signedOrder1.signature = abi.encodePacked(
            uint8(0),
            bytes32(0),
            bytes32(0)
        );

        // Fund the users now that we have generated their addresses
        tokenA.transfer(signedOrder1.user, 2 ether);
        tokenB.transfer(signedOrder2.user, 2 ether);

        // Approve the exchange contract to spend the tokens
        vm.prank(signedOrder1.user);
        tokenA.approve(address(exchangeContract), 2 ether);
        vm.prank(signedOrder2.user);
        tokenB.approve(address(exchangeContract), 2 ether);

        // Expect the transaction to revert due to invalid signatures
        vm.expectRevert();
        exchangeContract.executeTrade(
            signedOrder1,
            signedOrder2,
            1 ether,
            1 ether
        );
    }

    // Test trade when the user has not allowed the exchange contract to spend the tokens.
    function test_invalidAllowance() public {
        // Generate the orders
        OrderBookExchange.Order memory order1 = orderStub(true);
        OrderBookExchange.Order memory order2 = orderStub(false);

        // Generate the signed orders
        OrderBookExchange.Order memory signedOrder1 = _generateSignedOrder(
            order1,
            0x0A
        );
        OrderBookExchange.Order memory signedOrder2 = _generateSignedOrder(
            order2,
            0x0B
        );

        // Fund the users now that we have generated their addresses
        tokenA.transfer(signedOrder1.user, 2 ether);
        tokenB.transfer(signedOrder2.user, 2 ether);

        // Do not approve the exchange contract to spend the tokens
        // vm.prank(signedOrder1.user);
        // tokenA.approve(address(exchangeContract), 2 ether);
        // vm.prank(signedOrder2.user);
        // tokenB.approve(address(exchangeContract), 2 ether);

        // Expect the transaction to revert due to insufficient allowance
        vm.expectRevert();
        exchangeContract.executeTrade(
            signedOrder1,
            signedOrder2,
            1 ether,
            1 ether
        );
    }

    // Test trade when the user has not enough tokens.
    function test_invalidBalance() public {
        // Generate the orders
        OrderBookExchange.Order memory order1 = orderStub(true);
        OrderBookExchange.Order memory order2 = orderStub(false);

        // Generate the signed orders
        OrderBookExchange.Order memory signedOrder1 = _generateSignedOrder(
            order1,
            0x0A
        );
        OrderBookExchange.Order memory signedOrder2 = _generateSignedOrder(
            order2,
            0x0B
        );

        // Do not fund the users now that we have generated their addresses
        // tokenA.transfer(signedOrder1.user, 2 ether);
        // tokenB.transfer(signedOrder2.user, 2 ether);

        // Approve the exchange contract to spend the tokens
        vm.prank(signedOrder1.user);
        tokenA.approve(address(exchangeContract), 2 ether);
        vm.prank(signedOrder2.user);
        tokenB.approve(address(exchangeContract), 2 ether);

        // Expect the transaction to revert due to insufficient balance
        vm.expectRevert();
        exchangeContract.executeTrade(
            signedOrder1,
            signedOrder2,
            1 ether,
            1 ether
        );
    }

    // Fuzz test orders with random slippage values. Simple prices are tested.
    function testFuzz_slippageSimple(uint256 slippage1, uint256 slippage2) public {
        // Set fuzzing parameters
        slippage1 = bound(slippage1, 0, 10000);
        slippage2 = bound(slippage2, 0, 10000);

        // Generate the orders
        OrderBookExchange.Order memory order1 = orderStub(true);
        OrderBookExchange.Order memory order2 = orderStub(false);

        // Set order parameters
        order1.maxSlippage = slippage1;
        order2.maxSlippage = slippage2;

        // Generate the signed orders
        OrderBookExchange.Order memory signedOrder1 = _generateSignedOrder(
            order1,
            0x0A
        );
        OrderBookExchange.Order memory signedOrder2 = _generateSignedOrder(
            order2,
            0x0B
        );

        // Fund the users now that we have generated their addresses
        tokenA.transfer(signedOrder1.user, 2 ether);
        tokenB.transfer(signedOrder2.user, 2 ether);

        // Approve the exchange contract to spend the tokens
        vm.prank(signedOrder1.user);
        tokenA.approve(address(exchangeContract), 2 ether);
        vm.prank(signedOrder2.user);
        tokenB.approve(address(exchangeContract), 2 ether);

        // Submit the orders. The amount is 1 ether for both directions (ok, since both prices are exactly 1)
        exchangeContract.executeTrade(
            signedOrder1,
            signedOrder2,
            1 ether,
            1 ether
        );

        // Check that the orders have been matched
        assertEq(tokenA.balanceOf(signedOrder1.user), 1 ether);
        assertEq(tokenB.balanceOf(signedOrder2.user), 1 ether);
    }
}
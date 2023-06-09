// This is the core smart contract for the protocol. It is used to execute trades using the two provided, cryptographicly signed orders.
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../lib/openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol";
import "../lib/openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";

contract OrderBookExchange {
    using SafeERC20 for IERC20;
    uint256 constant IMPLEMENTATION_CODE = 0x01; // Used to prevent replay on future forks.

    event Match(
        address indexed userA,
        address indexed userB,
        address tokenA,
        address tokenB,
        uint256 amountA,
        uint256 amountB
    );

    event CancelOrder(address indexed user, uint256 old_nonce);

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
        uint256 code; // Contract specific code.
        bytes signature;
    }

    // Store the nonces of the users to prevent replay attacks and to allow order cancellation.
    mapping(address => uint256) public nonces;


    function executeTrade(
        Order memory orderA,
        Order memory orderB,
        uint256 amountA,
        uint256 amountB
    ) external {
        // Verify the orders match
        require(orderA.user != orderB.user, "Same user");
        require(orderA.tokenA == orderB.tokenB, "Token mismatch");
        require(orderA.tokenB == orderB.tokenA, "Token mismatch");

        // Validate the orders and signatures
        checkSignature(orderA);
        checkSignature(orderB);

        // Check price slippage and bounds
        checkTrade(orderA, amountA, amountB);
        checkTrade(orderB, amountB, amountA);

        // Update the nonces to invalidate previous orders
        nonces[orderA.user] = orderA.nonce + 1;
        nonces[orderB.user] = orderB.nonce + 1;

        // Funds are safe to transfer
        IERC20(orderA.tokenA).safeTransferFrom(
            orderA.user,
            orderB.user,
            amountA
        );
        IERC20(orderB.tokenA).safeTransferFrom(
            orderB.user,
            orderA.user,
            amountB
        );

        emit Match(
            orderA.user,
            orderB.user,
            orderA.tokenA,
            orderB.tokenA,
            amountA,
            amountB
        );
    }

    // No need to verify the signature here. Only the user can cancel his own orders.
    function cancelOrder() external {
        emit CancelOrder(msg.sender, nonces[msg.sender]);
        nonces[msg.sender] += 1;
    }

    function checkSignature(Order memory order) public pure {
        // Verify the order signature
        // Hash the struct containing the parameters of the trade
        bytes32 messageHash = keccak256(
            abi.encodePacked(
                order.user,
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

        // Prepend the prefix. Some libraries do it and some don't. Be sure to use it in the UI as well.
        bytes32 prefixedHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash)
        );

        // Process signature and extract the signer
        (bytes32 r, bytes32 s, uint8 v) = splitSignature(order.signature);
        address signer = ecrecover(prefixedHash, v, r, s); // Fails silently if the signature is invalid, need to check the signer is not 0x0.

        require(signer == order.user, "Wrong signer");
        require(signer != address(0), "Invalid signature");
    }

    // Checks wether given trade match with the parameters specified by the user.
    function checkTrade(
        Order memory order,
        uint256 amountA,
        uint256 amountB
    ) internal view returns (bool) {
        // Implementation code check
        require(
            order.code == IMPLEMENTATION_CODE,
            "Invalid implementation code"
        );

        // Nonce replay check
        require(order.nonce == nonces[order.user], "Invalid nonce");

        // Expiration check
        require(block.number <= order.expiration, "Order expired");

        // Bounds check
        require(amountA >= order.minAmountA, "Amount too low");
        require(amountA <= order.maxAmountA, "Amount too high");

        // Price slippage check (positive slippage is allowed).
        // (amountB_asked * discount) must be lower than (amountB_received)
        require(
            ((amountA * order.priceX96) >> 96) * (10000 - order.maxSlippage) <=
                amountB * 10000,
            "Price rejected (too much slippage ?)"
        ); // Use >> 96 to convert to fixed point float. Use * 10000 to convert to bips and avoid division.

        return true;
    }

    function splitSignature(bytes memory sig) public pure returns (bytes32 r, bytes32 s, uint8 v) {
        require(sig.length == 65, "invalid signature length");
        assembly {
            // first 32 bytes, after the length prefix
            r := mload(add(sig, 32))
            // second 32 bytes
            s := mload(add(sig, 64))
            // final byte (first byte of the next 32 bytes)
            v := byte(0, mload(add(sig, 96)))
        }
    }
}
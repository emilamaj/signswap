// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "../lib/forge-std/src/Script.sol";
import "../lib/forge-std/src/console.sol";
import "../lib/openzeppelin-contracts/contracts/utils/Strings.sol";
import "../lib/openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";

contract mockToken is ERC20 {
    constructor(string memory name, string memory symbol) ERC20(name, symbol) {
        _mint(msg.sender, 1 ether);
    }
}

contract DeployTokens is Script {
    ERC20 tokenA;
    ERC20 tokenB;
    // Users to fund with tokens
    address constant USER_A = 0xA6B2d0f124CcDE41479aE551F19d34310BaEebCE;
    address constant USER_B = 0x3c000F207ea062576C9cA79d5A8D99E5fC914FFC;

    function run() public {
        
        uint256 deployerPrivateKey = vm.envUint("EOA_PRIVATE_KEY");
        console.log("Deployer private key: ", deployerPrivateKey);

        // Deploy the contract
        /////////////////////////////
        // NOTE 1: Sometimes, the deployment fails for unknown reasons. To redeploy, the nonce of the transcation needs to be bumped by 1.
        // vm.setNonce(address(this), vm.getNonce(address(this)) + 1);
        /////////////////////////////
        vm.startBroadcast(deployerPrivateKey);
        // Deploy Tokens
        tokenA = new mockToken("TokenA", "TKA");
        tokenB = new mockToken("TokenB", "TKB");

        // Fund users with tokens
        tokenA.transfer(USER_A, 1 ether);
        tokenB.transfer(USER_B, 1 ether);
        vm.stopBroadcast();

        // Token addresses
        /* Create files to store the addresses of the tokens that were just deployed
        // tokenA.txt:
        0x0123...
        // tokenB.txt:
        0x4567...
        The files will be located in /contracts/tokenA.txt and /contracts/tokenB.txt */
        string memory path2 = "./tokenA.txt"; // The path is relative to the root of the project folder.
        string memory data2 = Strings.toHexString(uint256(uint160(address(tokenA))), 20);
        vm.writeFile(path2, data2);
        string memory path3 = "./tokenB.txt"; // The path is relative to the root of the project folder.
        string memory data3 = Strings.toHexString(uint256(uint160(address(tokenB))), 20);
        vm.writeFile(path3, data3);
        
        // Print the addresses
        console.log("Token A address: ", address(tokenA));
        console.log("Token B address: ", address(tokenB));

        //NOTE Sometimes, the deployment fails for unknown reasons, and to redeploy, the nonce of the transcation needs to be bumped by 1.
        console.log("If the transaction fails for 'gas underpriced' reasons, uncomment the line after 'NOTE 1'.");
    }
}
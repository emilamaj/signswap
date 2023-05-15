import React, { useState, useEffect } from 'react';
import Web3 from 'web3';
import { Button, TextField, Container, Typography } from '@mui/material';
import './App.css';

const IMPLEMENTATION_CODE = "0x01"; // Constant value for the implementation code
const web3 = new Web3(Web3.givenProvider);

const bn = (n) => Web3.utils.toBN(n);

const contractAddress = process.env.REACT_APP_CONTRACT_ADDRESS; // Add your contract address here
let contractABI; // Read the abi from /public/abi/OrderBookExchange.json
let erc20ABI; // Read the abi from /public/abi/ERC20.json
let contract;
// Defer contract creation until ABI is loaded
fetch('/abi/OrderBookExchange.json').then((response) => response.json()).then((data) => {
	contractABI = data.abi;
	contract = new web3.eth.Contract(contractABI, contractAddress);
});
fetch('/abi/ERC20.json').then((response) => response.json()).then((data) => {
	erc20ABI = data.abi;
});

function App() {
	// Form inputs
	const [account, setAccount] = useState('');
	const [tokenA, setTokenA] = useState('');
	const [tokenB, setTokenB] = useState('');
	const [minAmountA, setMinAmountA] = useState(''); // Ignore token decimals in App.js, convert to correct integer in handleSubmit()
	const [maxAmountA, setMaxAmountA] = useState('');
	const [price, setPrice] = useState('');
	const [maxSlippage, setMaxSlippage] = useState('');
	const [expiration, setExpiration] = useState('');
	// App data
	const [decimals, setDecimals] = useState({});

	// Find decimals of tokenA
	const getDecimals = async (tokenAddress) => {
		// Check if not already loaded
		const storedValue = decimals[tokenAddress];
		if (storedValue === undefined) {
			const tokenContract = new web3.eth.Contract(erc20ABI, tokenAddress);
			const decimals = await tokenContract.methods.decimals().call();
			setDecimals({ ...decimals, [tokenAddress]: decimals });
			return decimals;
		} else {
			return storedValue;
		}
	}

	// Approve contract to spend tokens of userA and userB
	const handleApprove = async (e) => {
		e.preventDefault(); // Prevent the page from reloading
		console.log("Approving tokens...")

		// Load wallet
		let loadedAccount = account;
		if (window.ethereum) {
			const accs = await window.ethereum.enable();
			console.log("Wallet returned accounts: ", accs)
			loadedAccount = accs[0];
			setAccount(loadedAccount);
			console.log("Loaded account: ", loadedAccount)
		}

		// Load token contract
		const tokenContractA = new web3.eth.Contract(erc20ABI, tokenA);

		// Approve contract to spend tokens (max amount)
		const maxAmount = bn(2).pow(bn(256)).sub(bn(1)).toString();
		await tokenContractA.methods.approve(contractAddress, maxAmount).send({ from: loadedAccount });
		console.log("Approved Exchange contract to spend tokens of userA")
	};

	// Submit order to backend
	const handleSubmit = async (e) => {
		e.preventDefault(); // Prevent the page from reloading
		console.log("Submitting order...")

		// Load wallet
		let loadedAccount = account;
		if (window.ethereum) {
			const accs = await window.ethereum.enable();
			console.log("Wallet returned accounts: ", accs)
			loadedAccount = accs[0];
			setAccount(loadedAccount);
			console.log("Loaded account: ", loadedAccount)
		}

		// Decimals of A
		const decA = await getDecimals(tokenA);
		console.log("Decimals of A: ", decA)

		// Load nonce
		const nonce = await contract.methods.nonces(loadedAccount).call();
		console.log("Current user nonce:", nonce)

		let order = {
			user: loadedAccount,
			tokenA,
			tokenB,
			minAmountA: bn(Math.floor(minAmountA * 10 ** 6)).mul(bn(10).pow(bn(decA))).div(bn(10 ** 6)).toString(),
			maxAmountA: bn(Math.floor(maxAmountA * 10 ** 6)).mul(bn(10).pow(bn(decA))).div(bn(10 ** 6)).toString(),
			priceX96: bn(Math.floor(price * 10 ** 6)).mul(bn(2).pow(bn(96))).div(bn(10 ** 6)).toString(),
			maxSlippage: maxSlippage,
			nonce: nonce,
			expiration: expiration,
			code: IMPLEMENTATION_CODE,
		};
		console.log("Order: ", order)

		const messageHash = web3.utils.soliditySha3(
			{ t: 'address', v: order.user },
			{ t: 'address', v: order.tokenA },
			{ t: 'address', v: order.tokenB },
			{ t: 'uint256', v: order.minAmountA },
			{ t: 'uint256', v: order.maxAmountA },
			{ t: 'uint256', v: order.priceX96 },
			{ t: 'uint256', v: order.maxSlippage },
			{ t: 'uint256', v: order.nonce },
			{ t: 'uint256', v: order.expiration },
			{ t: 'uint256', v: order.code },
		);
		console.log("Message hash:", messageHash)
		const signature = await web3.eth.personal.sign(messageHash, loadedAccount);
		console.log("Signature: ", signature)
		order.signature = signature;

		// Send the signed order to the backend
		fetch(process.env.REACT_APP_API_URL + '/api/orders', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(order),
		})
			.then((response) => response.json())
			.then((data) => {
				console.log(data);
			})
			.catch((error) => {
				console.error('Error:', error);
			});
	};


	return (
		<div className="container-app">
			<div className="container-top">
				<Typography variant="h4">Order Book Decentralized Exchange</Typography>
			</div>
			<div className="container-middle-panels">
				<div className="container-submit">
					<Typography variant="h5">Submit swap order</Typography>
					<form onSubmit={handleSubmit}>
						<TextField
							label="Token A"
							value={tokenA}
							onChange={(e) => setTokenA(e.target.value)}
							fullWidth
							margin="normal"
						/>
						<Button variant="contained"
							color="secondary"
							onClick={() => {
								setTokenA(tokenB);
								setTokenB(tokenA);
							}}>
							Switch
						</Button>

						<TextField
							label="Token B"
							value={tokenB}
							onChange={(e) => setTokenB(e.target.value)}
							fullWidth
							margin="normal"
						/>
						<div className="container-amounts"
						>
							<TextField
								label="Min Amount A"
								value={minAmountA}
								onChange={(e) => setMinAmountA(e.target.value)}
								fullWidth
								margin="normal"
							/>
							<TextField
								label="Max"
								value={maxAmountA}
								onChange={(e) => setMaxAmountA(e.target.value)}
								fullWidth
								margin="normal"
							/>
						</div>
						<TextField
							label="Price"
							value={price}
							onChange={(e) => setPrice(e.target.value)}
							fullWidth
							margin="normal"
						/>
						<TextField
							label="Max Slippage (1bp = 0.01%)"
							value={maxSlippage}
							onChange={(e) => setMaxSlippage(e.target.value)}
							fullWidth
							margin="normal"
							autoComplete="off"
						/>
						<TextField
							label="Expiration Block"
							value={expiration}
							onChange={(e) => setExpiration(e.target.value)}
							fullWidth
							margin="normal"
						/>
						<div className="container-buttons">
							<Button variant="contained" color="secondary" onClick={handleApprove}>
								Approve
							</Button>
							<Button type="submit" variant="contained" color="primary">
								Submit Order
							</Button>
						</div>
					</form>
				</div>
				<div className="container-recent">
					<Typography variant="h5">Recent orders</Typography>
				</div>
			</div>
		</div>
	);
}

export default App;
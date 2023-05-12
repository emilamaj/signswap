import React, { useState, useEffect } from 'react';
import Web3 from 'web3';
import { Button, TextField, Container, Typography } from '@mui/material';
import './App.css';

const IMPLEMENTATION_CODE = "0x01"; // Constant value for the implementation code
const web3 = new Web3(Web3.givenProvider);

const contractAddress = process.env.REACT_APP_CONTRACT_ADDRESS; // Add your contract address here
let contractABI; // Read the abi from /public/abi/OrderBookExchange.json
let contract;
// Defer contract creation until ABI is loaded
fetch('/abi/OrderBookExchange.json').then((response) => response.json()).then((data) => {
	contractABI = data.abi;
	contract = new web3.eth.Contract(contractABI, contractAddress);
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
			const erc20abi = await fetch('/abi/ERC20.json').then((response) => response.json()).then((data) => data.abi);
			const tokenContract = new web3.eth.Contract(erc20abi, tokenAddress);
			const decimals = await tokenContract.methods.decimals().call();
			setDecimals({ ...decimals, [tokenAddress]: decimals });
			return decimals;
		} else {
			return storedValue;
		}
	}

	// Submit order to backend
	const handleSubmit = async (e) => {
		e.preventDefault(); // Prevent the page from reloading
		console.log("Submitting order...")

		// Load wallet
		let loadedAccount;
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
			minAmountA: web3.utils.toBN(minAmountA).mul(web3.utils.toBN(10).pow(web3.utils.toBN(decA))).toString(),
			maxAmountA: web3.utils.toBN(maxAmountA).mul(web3.utils.toBN(10).pow(web3.utils.toBN(decA))).toString(),
			priceX96: web3.utils.toBN(price).mul(web3.utils.toBN(2).pow(web3.utils.toBN(96))).toString(),
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
				<Typography variant="h2">Order Book Decentralized Exchange</Typography>
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
						<TextField
							label="Token B"
							value={tokenB}
							onChange={(e) => setTokenB(e.target.value)}
							fullWidth
							margin="normal"
						/>
						<TextField
							label="Min Amount A"
							value={minAmountA}
							onChange={(e) => setMinAmountA(e.target.value)}
							fullWidth
							margin="normal"
						/>
						<TextField
							label="Max Amount A"
							value={maxAmountA}
							onChange={(e) => setMaxAmountA(e.target.value)}
							fullWidth
							margin="normal"
						/>
						<TextField
							label="Price"
							value={price}
							onChange={(e) => setPrice(e.target.value)}
							fullWidth
							margin="normal"
						/>
						<TextField
							label="Max Slippage"
							value={maxSlippage}
							onChange={(e) => setMaxSlippage(e.target.value)}
							fullWidth
							margin="normal"
						/>
						<TextField
							label="Expiration"
							value={expiration}
							onChange={(e) => setExpiration(e.target.value)}
							fullWidth
							margin="normal"
						/>
						<Button type="submit" variant="contained" color="primary">
							Submit Order
						</Button>
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
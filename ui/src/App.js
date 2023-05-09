import React, { useState, useEffect } from 'react';
import Web3 from 'web3';
import { Button, TextField, Container, Typography } from '@mui/material';
import './App.css';

const IMPLEMENTATION_CODE = 0x01; // Constant value for the implementation code
const web3 = new Web3(Web3.givenProvider);

const contractAddress = process.env.REACT_APP_CONTRACT_ADDRESS; // Add your contract address here
let contractABI; // Read the abi from /public/abi/OrderBookExchange.json
let contract;
// Defer contract creation until ABI is loaded
fetch('/abi/OrderBookExchange.json').then((response) => response.json()).then((data) => { 
	contractABI = data;
	contract = new web3.eth.Contract(contractABI, contractAddress);
});

function App() {
	const [account, setAccount] = useState('');
	const [tokenA, setTokenA] = useState('');
	const [tokenB, setTokenB] = useState('');
	const [minAmountA, setMinAmountA] = useState('');
	const [maxAmountA, setMaxAmountA] = useState('');
	const [priceX96, setPriceX96] = useState('');
	const [maxSlippage, setMaxSlippage] = useState('');
	const [expiration, setExpiration] = useState('');

	useEffect(() => {
		if (window.ethereum) {
			window.ethereum.enable().then((accounts) => {
				setAccount(accounts[0]);
			});
		}
	}, []);

	const handleSubmit = async (e) => {
		e.preventDefault(); // Prevent the page from reloading
		console.log("Submitting order...")

		const nonce = await contract.methods.nonces(account).call();
		const messageHash = web3.utils.soliditySha3(
			{ t: 'address', v: account },
			{ t: 'address', v: tokenA },
			{ t: 'address', v: tokenB },
			{ t: 'uint256', v: minAmountA },
			{ t: 'uint256', v: maxAmountA },
			{ t: 'uint256', v: Math.floor(priceX96 * 2 ** 96) }, // Apply bitwise left-shift by 96, then take integer part by using Math.floor()
			{ t: 'uint256', v: maxSlippage },
			{ t: 'uint256', v: nonce },
			{ t: 'uint256', v: expiration },
			{ t: 'uint256', v: IMPLEMENTATION_CODE },
		);

		const signature = await web3.eth.personal.sign(messageHash, account);
		console.log("Signature: ", signature)

		const order = {
			user: account,
			tokenA,
			tokenB,
			minAmountA,
			maxAmountA,
			priceX96: Math.floor(priceX96 * 2 ** 96), // Convert to .96 fixed point format
			maxSlippage,
			nonce,
			expiration,
			IMPLEMENTATION_CODE,
			signature,
		};

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
		<Container>
			<Typography variant="h4">Order Book Decentralized Exchange</Typography>
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
					value={priceX96}
					onChange={(e) => setPriceX96(e.target.value)}
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
		</Container>
	);
}

export default App;
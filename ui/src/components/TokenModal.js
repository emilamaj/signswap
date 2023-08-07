import React, { useState, useEffect, useRef } from 'react';
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Typography, Stack } from '@mui/material';
import './TokenModal.css';

const TokenModal = ({ open, onClose, onSelect, tokenList }) => {
    const [search, setSearch] = useState('');
    const [displayTokens, setDisplayTokens] = useState([]);
    const [tokenIndex, setTokenIndex] = useState(20);

    const handleSearch = (e) => {
        console.log("Searching...")
        setSearch(e.target.value);
        // If tokenList is not loaded yet, do nothing
        if (!tokenList) {
            return;
        }
        // If search is empty, display first 20 tokens
        if (e.target.value === '') {
            setDisplayTokens(tokenList.slice(0, tokenIndex));
        } else {
            // Search for tokens that match the search query
            let searchResults = tokenList.filter((token) => {
                return token.symbol.toLowerCase().startsWith(e.target.value.toLowerCase()) || token.name.toLowerCase().startsWith(e.target.value.toLowerCase()) || token.address.toLowerCase().startsWith(e.target.value.toLowerCase());
            });
            // If the list is empty, check if the search query is an address
            if (searchResults.length === 0) {
                if (e.target.value.startsWith('0x') && e.target.value.length === 42) {
                    // Create an "unknown" token with the address
                    const unknownToken = {
                        address: e.target.value,
                        name: 'Unknown Token',
                        symbol: e.target.value,
                        decimals: 18,
                        logoURI: '/badge_unknown_token.webp'
                    }

                    // Modify the search results to include the unknown token
                    searchResults = [unknownToken];
                }
            }
            // Display the first 20 results
            setDisplayTokens(searchResults.slice(0, tokenIndex));
        }
        console.log("Done searching.")
    }

    const handleSelect = (token) => {
        onSelect(token);
    }

    const handleCancel = () => {
        onClose();
    }

    const handleScroll = (e) => {
        const bottom = e.target.scrollHeight - e.target.scrollTop <= e.target.clientHeight + 500;
        if (bottom) {
            setTokenIndex(prevTokenIndex => prevTokenIndex + 20);
        }
    }

    useEffect(() => {
        setDisplayTokens(tokenList.slice(0, tokenIndex));
    }, [tokenIndex, tokenList]);

    return (
        <div className='container-token-modal'>
            <Dialog open={open} onClose={handleCancel} PaperProps={{ style: { background: 'linear-gradient(to right, #ff8800, #e52d27)' } }}>
                <DialogTitle sx={{ color: 'white', filter: 'drop-shadow(0 0 0.2rem #000000)' }}
                >Select a token</DialogTitle>
                <TextField
                    label="Search"
                    value={search}
                    onChange={handleSearch}
                    autoComplete='off'
                    style={{
                        margin: '0 16px 16px 16px',
                        color: 'white',
                    }}
                />
                <DialogContent onScroll={handleScroll} sx={{ height: '35vh', padding: "0" }}>
                    <Stack direction="column" justifyContent="flex-start" alignItems="flex-start">
                        { displayTokens.length !== 0 ?

                            displayTokens.map((token) => {
                                return (
                                    <Button
                                        key={token.address}
                                        onClick={() => handleSelect(token)}
                                        fullWidth
                                    >
                                        <div className='container-token' style={{
                                            padding: '0 1rem', background: 'linear-gradient(to right, #ffb25b, #e7615d)'
                                        }}>
                                            <img src={token.logoURI} alt={token.name} width="32" height="32" loading='lazy' />
                                            <div className='container-token-details'>
                                                <Typography variant="body1" sx={{
                                                    color: 'white', textTransform: "none", filter: 'drop-shadow(0 0 0.1rem #000000)'
                                                }}>
                                                    {token.name}
                                                </Typography>
                                                <Typography variant="body2" sx={{
                                                    color: 'text.secondary', textTransform: "none"
                                                }}>
                                                    {token.symbol}
                                                </Typography>
                                            </div>
                                        </div>
                                    </Button>
                                );
                            }) :
                            <Typography variant="body1" sx={{
                                color: 'white', textTransform: "none", filter: 'drop-shadow(0 0 0.2rem #000000)'
                            }}>
                                No results found
                            </Typography>

                        }
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCancel}>Cancel</Button>
                </DialogActions>
            </Dialog>
        </div>
    );
}

export default TokenModal;
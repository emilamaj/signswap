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
            const searchResults = tokenList.filter((token) => {
                return token.symbol.toLowerCase().startsWith(e.target.value.toLowerCase()) || token.name.toLowerCase().startsWith(e.target.value.toLowerCase()) || token.address.toLowerCase().startsWith(e.target.value.toLowerCase());
            });
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
            <Dialog open={open} onClose={handleCancel}>
                <DialogTitle>Select a token</DialogTitle>
                <TextField
                    label="Search"
                    value={search}
                    onChange={handleSearch}
                    autoComplete='off'
                    style={{margin: '0 16px'}}
                />
                <DialogContent onScroll={handleScroll}>
                    <Stack direction="column" justifyContent="flex-start" alignItems="flex-start">
                        {displayTokens.map((token) => {
                            return (
                                <Button
                                    key={token.address}
                                    onClick={() => handleSelect(token)}
                                    fullWidth
                                >
                                    <div className='container-token'>
                                        <img src={token.logoURI} alt={token.name} width="32" height="32" loading='lazy'/>
                                        <div className='container-token-details'>
                                            <Typography variant="body1">
                                                {token.name}
                                            </Typography>
                                            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                                                {token.symbol}
                                            </Typography>
                                        </div>
                                    </div>
                                </Button>
                            );
                        })}
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
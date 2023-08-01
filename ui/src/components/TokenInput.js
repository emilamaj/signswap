import React, { useState, useEffect } from 'react';
import { Button, TextField, Typography, InputAdornment } from '@mui/material';
import TokenModal from './TokenModal';

const TokenInput = ({ label, tokenList, token, updateToken }) => {
    const [modalOpen, setModalOpen] = useState(false);

    const handleModalOpen = () => {
        setModalOpen(true);
    }

    const handleModalClose = () => {
        setModalOpen(false);
    }

    const handleTokenSelect = (token) => {
        updateToken(token);
        handleModalClose();
    }

    const balanceText = () => {
        let text = '';
        if (!token.balance) {
            return "N/A"
        }
        
        if (!token.balance.token) {
            return "N/A"
        }

        text += token.balance.token;

        // Check if usd balance is null (0 is a valid value !)
        if (!token.balance.usd && token.balance.usd !== 0) {
            text += " ($N/A)";
        } else {
            text += ` ($${token.balance.usd})`;
        }

        return text;
    }

    return (
        <>
            <TextField
                label={label}
                value={token.symbol ? token.symbol : ''}
                onClick={handleModalOpen}
                InputProps={{
                    readOnly: true,
                    startAdornment: (
                        <InputAdornment position="start">
                            {
                                token.logoURI && <img src={token.logoURI} alt={token.symbol} style={{ width: '24px', height: '24px' }} />
                            }
                        </InputAdornment>
                    ),
                    endAdornment: (
                        <InputAdornment position="end">
                            Balance: {balanceText()}
                        </InputAdornment>
                    ),
                }}
                autoComplete='off'
                fullWidth
                margin="normal"
            />
            <TokenModal
                open={modalOpen}
                onClose={handleModalClose}
                onSelect={handleTokenSelect}
                tokenList={tokenList}
                display={modalOpen ? 'block' : 'none'}
            />
        </>
    );
}

export default TokenInput;
import React, { useState, useEffect } from 'react';
import { Button, TextField, Typography, InputAdornment } from '@mui/material';
import TokenModal from './TokenModal';

const TokenInput = ({ label, tokenList, token, updateToken, balance }) => {
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
                            <img src={token.logoURI} alt={token.symbol} style={{width: '24px', height: '24px'}}/>
                        </InputAdornment>
                    ),
                }}
                autoComplete='off'
                fullWidth
                margin="normal"
            />
            <Typography variant="body2" display={balance ? 'block' : 'none'}
             sx={{ color: 'text.secondary' }}>
                {balance ? `Balance: ${balance}` : ''}
            </Typography>
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
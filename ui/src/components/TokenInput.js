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
                            <img src={token.logoURI} alt={token.symbol} style={{ width: '24px', height: '24px' }} />
                        </InputAdornment>
                    ),
                    endAdornment: (
                        <InputAdornment position="end">
                            Balance: {token.balance ? token.balance : 'N/A'}
                        </InputAdornment>
                    ),
                }}
                autoComplete='off'
                fullWidth
                margin="normal"
                helperText="toto"
            />
            <Typography variant="body2" display={token.balance ? 'block' : 'none'}
                sx={{ color: 'text.secondary' }}>
                {token.balance ? `Balance: ${token.balance}` : ''}
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
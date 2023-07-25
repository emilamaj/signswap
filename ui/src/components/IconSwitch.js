import React from 'react';
import { Button } from '@mui/material';

function IconSwitch({ switchAction }) {
  return (
    <Button variant="contained"
      color="secondary"
      onClick={switchAction}
      title="Switch Tokens"
      style={{
        padding: 0,
        color: "white",
        minWidth: "50px",
        }}>
      <svg className="svg-icon" width="24" height="24" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" fill="white"><path d="M886.2 604.8H137.8c-22.1 0-40 17.9-40 40 0 8.4 2.6 16.2 7 22.6 1.9 4.5 4.8 8.7 8.4 12.4L289.5 856c7.8 7.8 18 11.7 28.3 11.7s20.5-3.9 28.3-11.7c15.6-15.6 15.6-40.9 0-56.6L231.3 684.8h654.8c22.1 0 40-17.9 40-40s-17.8-40-39.9-40zM137.8 419.2h748.4c22.1 0 40-17.9 40-40 0-8.4-2.6-16.2-7-22.6-1.4-3.3-3.4-6.5-5.8-9.5L769.2 170.9c-14-17.1-39.2-19.6-56.3-5.6-17.1 14-19.6 39.2-5.6 56.3l96.3 117.6H137.8c-22.1 0-40 17.9-40 40s17.9 40 40 40z" /></svg>
    </Button>
  );
}

export default IconSwitch;
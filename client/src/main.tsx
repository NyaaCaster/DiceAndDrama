import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {APP_NAME, APP_VERSION, BLESSING} from './version.ts';
import './index.css';

console.info(`[${APP_NAME} v${APP_VERSION}] ${BLESSING}`);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

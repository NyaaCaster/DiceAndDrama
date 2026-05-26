import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {APP_NAME, APP_VERSION, BLESSING} from './version.ts';
import {installSarcasmTriggers} from './services/dm/sarcasmTrigger';
import './index.css';

console.info(`[${APP_NAME} v${APP_VERSION}] ${BLESSING}`);

// 全局只装一次。订阅 dice-rolled / dm-parse-warning，把"值得吐槽的瞬间"
// 攒成下回合的种子；幂等，StrictMode 双调用安全。
installSarcasmTriggers();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

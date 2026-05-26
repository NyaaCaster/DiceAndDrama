import {APP_NAME, APP_VERSION, BLESSING} from './version.ts';

export default function App() {
  return (
    <main
      data-blessing={BLESSING}
      className="min-h-dvh w-full flex flex-col items-center justify-center
                 bg-gradient-to-br from-indigo-950 via-slate-900 to-stone-900
                 text-stone-100 px-6 py-12 gap-6"
    >
      <header className="text-center space-y-2">
        <p className="text-xs tracking-[0.4em] text-indigo-300/80 uppercase">
          骰子 与 戏精
        </p>
        <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight">
          {APP_NAME}
        </h1>
        <p className="text-stone-400 text-sm">
          v{APP_VERSION} · 像素风元 TRPG · DM 由猫娘 Nyaa 担任
        </p>
      </header>

      <section className="max-w-md text-center space-y-3 text-stone-300/90 leading-relaxed">
        <p>
          *Nyaa 翘起尾巴尖，把骰子从桌沿拨下去，眯眼笑*
        </p>
        <p className="text-stone-400">
          喵～酒馆门还没推开，史莱姆已经在啃桌腿了。先把环境跑通，咱们再开团。
        </p>
      </section>

      <footer className="mt-8 text-xs text-stone-500 font-mono">
        client boot ok · 等待 LLM / MCP 接入（M2 / M3）
      </footer>
    </main>
  );
}

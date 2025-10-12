import { type NextPage } from "next";
import Head from "next/head";
import { useCallback, useEffect, useMemo, useState } from "react";
import Button from "../components/Button";
import DefaultLayout from "../layout/default";

const PYODIDE_VERSION = "0.24.1";
const DEFAULT_CODE = `import numpy as np
import matplotlib.pyplot as plt

x = np.linspace(0, 2 * np.pi, 200)
y = np.sin(x)

plt.figure(figsize=(6, 3))
plt.plot(x, y)
plt.title("Sine wave")
plt.xlabel("x")
plt.ylabel("sin(x)")
plt.grid(True)
plt.show()
`;

declare global {
  interface Window {
    loadPyodide?: (options: { indexURL: string }) => Promise<any>;
  }
}

const PythonPlaygroundPage: NextPage = () => {
  const [pyodide, setPyodide] = useState<any | null>(null);
  const [code, setCode] = useState(DEFAULT_CODE);
  const [output, setOutput] = useState<string>("");
  const [images, setImages] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState("Python環境を読み込み中...");
  const [isRunning, setIsRunning] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadPyodideRuntime = async () => {
      if (typeof window === "undefined") {
        return;
      }

      try {
        setStatusMessage("Pyodideをダウンロード中...");
        if (!window.loadPyodide) {
          await new Promise<void>((resolve, reject) => {
            const script = document.createElement("script");
            script.src = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/pyodide.js`;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error("Pyodideの読み込みに失敗しました"));
            document.body.appendChild(script);
          });
        }

        if (!window.loadPyodide) {
          throw new Error("Pyodideが利用できません");
        }

        setStatusMessage("Python環境を初期化しています...");
        const instance = await window.loadPyodide({
          indexURL: `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`,
        });

        if (cancelled) {
          return;
        }

        setStatusMessage("科学計算ライブラリを読み込み中...");
        await instance.loadPackage(["numpy", "matplotlib"]);

        if (cancelled) {
          return;
        }

        setPyodide(instance);
        setIsLoading(false);
        setStatusMessage("Python環境の準備が整いました！");
      } catch (error) {
        if (!cancelled) {
          const message =
            error instanceof Error ? error.message : "不明なエラーが発生しました";
          setErrorMessage(message);
          setIsLoading(false);
        }
      }
    };

    void loadPyodideRuntime();

    return () => {
      cancelled = true;
    };
  }, []);

  const runCode = useCallback(async () => {
    if (!pyodide) {
      return;
    }

    setIsRunning(true);
    setImages([]);
    setOutput("");
    setErrorMessage(null);

    const pushFigure = (img: unknown) => {
      if (typeof img === "string") {
        setImages((prev) => [...prev, img]);
      }
    };

    pyodide.globals.set("send_figure", pushFigure);

    try {
      const result = await pyodide.runPythonAsync(`
import sys
import io
import base64

from js import send_figure

_stdout = sys.stdout
_stderr = sys.stderr
_buffer = io.StringIO()
sys.stdout = _buffer
sys.stderr = _buffer

import matplotlib
matplotlib.use("AGG")
from matplotlib import pyplot as plt

import io as _img_io

def _flush_figures():
    figs = plt.get_fignums()
    for fig in figs:
        plt.figure(fig)
        buf = _img_io.BytesIO()
        plt.savefig(buf, format="png", bbox_inches="tight")
        buf.seek(0)
        send_figure("data:image/png;base64," + base64.b64encode(buf.read()).decode("ascii"))
        buf.close()
        plt.close(fig)

def show(*args, **kwargs):
    _flush_figures()

plt.show = show

${code}

_flush_figures()
sys.stdout = _stdout
sys.stderr = _stderr
_buffer.getvalue()
`);

      const textOutput =
        typeof result === "string"
          ? result
          : typeof result?.toString === "function"
          ? result.toString()
          : "";

      setOutput(textOutput);

      if (result && typeof (result as { destroy?: () => void }).destroy === "function") {
        (result as { destroy: () => void }).destroy();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setErrorMessage(message);
    } finally {
      setIsRunning(false);
    }
  }, [code, pyodide]);

  const pageTitle = useMemo(
    () => "Python Playground | AgentGPT",
    []
  );

  return (
    <DefaultLayout>
      <Head>
        <title>{pageTitle}</title>
      </Head>
      <main className="flex min-h-screen w-full justify-center px-4 py-10 text-white">
        <div className="flex w-full max-w-5xl flex-col gap-6">
          <header className="flex flex-col gap-2">
            <h1 className="text-3xl font-bold sm:text-4xl">Pythonプレイグラウンド</h1>
            <p className="text-sm text-white/70 sm:text-base">
              ブラウザ上でPythonコードを実行して、その場でグラフを確認できます。NumPyとMatplotlibは既にインストール済みです。
            </p>
          </header>

          <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.8fr)]">
            <div className="flex flex-col gap-4">
              <label className="text-sm font-semibold text-white/80" htmlFor="python-code">
                コード
              </label>
              <textarea
                id="python-code"
                className="h-80 w-full rounded-lg border border-white/20 bg-black/40 p-4 font-mono text-sm text-white shadow-inner focus:border-white/60 focus:outline-none focus:ring-2 focus:ring-blue-400/40 sm:text-base"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                spellCheck={false}
                disabled={isLoading}
              />
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  onClick={async () => {
                    if (!isRunning) {
                      await runCode();
                    }
                  }}
                  loader
                  disabled={isLoading || isRunning}
                >
                  {isRunning ? "実行中..." : "実行する"}
                </Button>
                {isLoading ? (
                  <span className="text-sm text-white/60">{statusMessage}</span>
                ) : null}
              </div>
            </div>

            <div className="flex flex-col gap-4 rounded-lg border border-white/10 bg-black/30 p-4">
              <h2 className="text-lg font-semibold text-white/90">出力</h2>
              {errorMessage ? (
                <pre className="whitespace-pre-wrap rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
                  {errorMessage}
                </pre>
              ) : (
                <pre className="whitespace-pre-wrap rounded-md border border-white/10 bg-black/40 p-3 text-sm text-white/80">
                  {output || "(出力はありません)"}
                </pre>
              )}
              {images.length > 0 ? (
                <div className="flex flex-col gap-4">
                  <h3 className="text-base font-semibold text-white/90">グラフ</h3>
                  <div className="flex flex-col gap-4">
                    {images.map((src, index) => (
                      <figure key={index} className="flex flex-col gap-2">
                        <img
                          src={src}
                          alt={`グラフ ${index + 1}`}
                          className="w-full rounded-md border border-white/10 bg-white/5"
                        />
                        <figcaption className="text-xs text-white/60">
                          図 {index + 1}
                        </figcaption>
                      </figure>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </section>
        </div>
      </main>
    </DefaultLayout>
  );
};

export default PythonPlaygroundPage;

import Link from "@docusaurus/Link";
import useBaseUrl from "@docusaurus/useBaseUrl";
import MonolithHero from "@site/src/components/MonolithHero";
import MotionField, { MotionControl } from "@site/src/components/MotionField";
import CodeBlock from "@theme/CodeBlock";
import Layout from "@theme/Layout";
import { useState } from "react";
import styles from "./index.module.css";

const steps = [
  {
    name: "Define",
    file: "tools/greet.ts",
    title: "A small definition.",
    text: "Your schema and your handler, together. Inferred types while you write. Validated values when it runs.",
    code: `import { tool } from "@toolgrain/mcp";
import { z } from "zod";

export const greet = tool({
  input: z.object({ name: z.string().min(1) }),
  output: z.object({ message: z.string() }),
  execute: ({ name }) => ({
    message: \`Hello, \${name}!\`,
  }),
});`,
  },
  {
    name: "Compose",
    file: "server.ts",
    title: "Give it a home.",
    text: "Register independent tools on a server. The registration key becomes the name your clients discover.",
    code: `import { createServer } from "@toolgrain/mcp";
import { greet } from "./tools/greet.js";

export const server = createServer({
  name: "hello-server",
  version: "1.0.0",
  tools: { greet },
});`,
  },
  {
    name: "Serve",
    file: "index.ts",
    title: "Open a connection.",
    text: "Pick the transport explicitly. Start locally with stdio, or bring the same tools to an HTTP application.",
    code: `import { stdio } from "@toolgrain/node";
import { server } from "./server.js";

await server.listen(stdio());

// HTTP instead? Use http() from @toolgrain/node.
// await server.listen(http({ port: 3000 }));`,
  },
];
const capabilities = [
  [
    "Validation",
    "Typed at the edges.",
    "Zod inputs and outputs are parsed asynchronously, including defaults and transforms.",
    "/docs/tools/validation",
  ],
  [
    "Context",
    "Services, on demand.",
    "Resolve application services lazily and share them within a single tool context.",
    "/docs/guides/context",
  ],
  [
    "Authorization",
    "Identity before execution.",
    "Verify JWT or Clerk access tokens before tool work begins. Read frozen identities in your handlers.",
    "/docs/authentication/overview",
  ],
  [
    "Cancellation",
    "A signal to stop.",
    "Observe the request signal when the client cancels, disconnects, or the server closes.",
    "/docs/guides/cancellation",
  ],
];
export default function Home() {
  const [step, setStep] = useState(0);
  const current = steps[step];
  const wordmark = useBaseUrl("/brand/wordmark-light.svg");
  return (
    <Layout
      noFooter
      title="Typed tools for MCP servers"
      description="Define reusable, typed MCP tools with Zod validation. Serve over stdio or HTTP with Toolgrain's TypeScript authoring API."
    >
      <main className={styles.landing}>
        <MonolithHero />
        <div className={styles.body}>
          <div className={styles.indexLine}>
            <span>From function to capability</span>
            <span>TypeScript → MCP</span>
          </div>
          <section className={styles.build} aria-labelledby="build-title">
            <div className={styles.buildIntro}>
              <p className={styles.eyebrow}>01 / The authoring experience</p>
              <h2 id="build-title">
                Three moves.
                <br />
                One useful tool.
              </h2>
              <Link to="/docs/getting-started/stdio">
                Walk through the quickstart ↗
              </Link>
            </div>
            <div className={styles.workbench}>
              <div className={styles.editorSignal} aria-hidden="true">
                <span /> <span /> <span />
              </div>
              <div
                className={styles.steps}
                role="tablist"
                aria-label="Build an MCP server"
              >
                {steps.map((item, index) => (
                  <button
                    type="button"
                    role="tab"
                    id={`step-${index}`}
                    aria-selected={step === index}
                    aria-controls="step-panel"
                    tabIndex={step === index ? 0 : -1}
                    key={item.name}
                    onClick={() => setStep(index)}
                    onKeyDown={(event) => {
                      if (
                        ["ArrowRight", "ArrowLeft", "Home", "End"].includes(
                          event.key,
                        )
                      ) {
                        event.preventDefault();
                        const next =
                          event.key === "Home"
                            ? 0
                            : event.key === "End"
                              ? 2
                              : (step + (event.key === "ArrowRight" ? 1 : 2)) %
                                3;
                        setStep(next);
                        document.getElementById(`step-${next}`)?.focus();
                      }
                    }}
                  >
                    <span>0{index + 1}</span>
                    {item.name}
                    <span aria-hidden="true">↗</span>
                  </button>
                ))}
              </div>
              <div
                id="step-panel"
                role="tabpanel"
                aria-labelledby={`step-${step}`}
                className={styles.editor}
              >
                <div className={styles.editorBar}>
                  <span>{current.file}</span>
                  <span>TypeScript</span>
                </div>
                <CodeBlock language="typescript">{current.code}</CodeBlock>
                <div className={styles.editorNote}>
                  <strong>{current.title}</strong>
                  <p>{current.text}</p>
                </div>
              </div>
            </div>
          </section>
          <section
            className={styles.transport}
            aria-labelledby="transport-title"
          >
            <div className={styles.sectionHeading}>
              <p className={styles.eyebrow}>02 / Connection, your way</p>
              <h2 id="transport-title">
                One definition.
                <br />
                <span>Two ways out.</span>
              </h2>
            </div>
            <div className={styles.routes}>
              <MotionField variant="flow" />
              <div className={styles.routeOrigin}>
                <span aria-hidden="true">↳</span>
                <code>tools: {"{ greet }"}</code>
                <span>Independent. Reusable. Yours.</span>
              </div>
              <div className={styles.routeChoices}>
                {[
                  [
                    "stdio",
                    "Local by nature.",
                    "For agents running beside your application.",
                    "stdio()",
                    "stdio",
                  ],
                  [
                    "HTTP",
                    "Ready to connect.",
                    "For a service, or your existing web framework.",
                    "http({ port: 3000 })",
                    "http",
                  ],
                ].map(([name, title, text, code, href]) => (
                  <Link
                    className={styles.route}
                    key={name}
                    to={`/docs/getting-started/${href}`}
                  >
                    <div>
                      <span className={styles.eyebrow}>{name}</span>
                      <span aria-hidden="true">↗</span>
                    </div>
                    <h3>{title}</h3>
                    <p>{text}</p>
                    <code>server.listen({code})</code>
                  </Link>
                ))}
              </div>
            </div>
          </section>
          <section
            className={styles.capabilities}
            aria-labelledby="capabilities-title"
          >
            <div className={styles.capabilityIntro}>
              <div className={styles.orbitGraphic} aria-hidden="true">
                <MotionField variant="orbit" />
                <span className={styles.orbitCore} />
              </div>
              <p className={styles.eyebrow}>03 / Beyond the handler</p>
              <h2 id="capabilities-title">
                Small tools.
                <br />
                Considered
                <br />
                <span>surroundings.</span>
              </h2>
              <p>
                The parts around execution deserve the same care as the function
                itself.
              </p>
            </div>
            <div className={styles.capabilityList}>
              {capabilities.map(([label, title, text, href], index) => (
                <Link to={href} key={label} className={styles.capability}>
                  <span className={styles.number}>0{index + 1}</span>
                  <div>
                    <span className={styles.eyebrow}>{label}</span>
                    <h3>{title}</h3>
                    <p>{text}</p>
                  </div>
                  <span aria-hidden="true">↗</span>
                </Link>
              ))}
            </div>
          </section>
          <section
            className={styles.compatibility}
            aria-label="Supported platform"
          >
            <div>
              <p className={styles.eyebrow}>Built on explicit boundaries</p>
              <Link to="/docs/compatibility/overview">
                Support & limitations ↗
              </Link>
            </div>
            <dl>
              <div>
                <dt>Protocol revisions</dt>
                <dd>
                  2026-07-28
                  <br />
                  2025-06-18
                </dd>
              </div>
              <div>
                <dt>Application runtimes</dt>
                <dd>
                  Node ^24.20.0
                  <br />
                  Bun ≥1.4.4 &lt;2
                </dd>
              </div>
              <div>
                <dt>Authoring</dt>
                <dd>
                  TypeScript 5.5.4+
                  <br />
                  Zod 4
                </dd>
              </div>
            </dl>
          </section>
        </div>
        <footer className={styles.footer}>
          <MotionField variant="footer" />
          <div className={styles.footerSignal}>
            <span>
              <i /> Signal out. Possibilities open.
            </span>
            <MotionControl />
          </div>
          <div className={styles.footerTop}>
            <div>
              <p className={styles.eyebrow}>Your next useful function</p>
              <Link
                className={styles.footerCta}
                to="/docs/getting-started/stdio"
              >
                Make it a tool.<span aria-hidden="true">↗</span>
              </Link>
            </div>
            <nav aria-label="Footer navigation">
              <Link to="/docs/introduction">Documentation</Link>
              <Link to="/docs/reference/mcp">API reference</Link>
              <Link to="/docs/examples">Examples</Link>
              <a href="https://github.com/keshavkatwe/toolgrain">
                Source on GitHub ↗
              </a>
            </nav>
          </div>
          <div className={styles.wordmarkStage}>
            <div
              className={styles.wordmarkMetal}
              style={{
                maskImage: `url(${wordmark})`,
                WebkitMaskImage: `url(${wordmark})`,
              }}
              aria-hidden="true"
            />
            <img
              className={styles.wordmark}
              src={wordmark}
              alt="Toolgrain"
              width="1200"
              height="230"
            />
            <span className={styles.wordmarkOrbit} aria-hidden="true" />
          </div>
          <div className={styles.footerBottom}>
            <span>© 2026 Keshav Katwe · MIT</span>
            <span>
              <i /> 0.1.0 in development · Packages unpublished
            </span>
            <Link to="/docs/project/changelog">Follow the changes ↗</Link>
          </div>
        </footer>
      </main>
    </Layout>
  );
}

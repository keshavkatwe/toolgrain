import Link from "@docusaurus/Link";
import useBaseUrl from "@docusaurus/useBaseUrl";
import SiteIcon from "@site/src/components/SiteIcon";
import styles from "./styles.module.css";
export default function Footer() {
  const light = useBaseUrl("/brand/logo-light.svg"),
    dark = useBaseUrl("/brand/logo-dark.svg");
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.top}>
          <div>
            <span className={styles.eyebrow}>From reading to building</span>
            <Link className={styles.cta} to="/docs/examples">
              Put a tool to work.<span aria-hidden="true">↗</span>
            </Link>
          </div>
          <nav aria-label="Footer navigation">
            <Link to="/docs/getting-started/stdio">Quickstart</Link>
            <Link to="/docs/reference/mcp">API reference</Link>
            <Link to="/docs/compatibility/overview">Compatibility</Link>
            <Link to="/docs/project/contributing">Contribute</Link>
          </nav>
        </div>
        <div className={styles.bottom}>
          <Link to="/" aria-label="Toolgrain home">
            <img
              className={styles.lightLogo}
              src={light}
              alt="Toolgrain"
              width="165"
              height="39"
            />
            <img
              className={styles.darkLogo}
              src={dark}
              alt="Toolgrain"
              width="165"
              height="39"
            />
          </Link>
          <span>0.1.0 in development · Packages unpublished</span>
          <a
            href="https://github.com/keshavkatwe/toolgrain"
            aria-label="Toolgrain on GitHub"
          >
            <SiteIcon name="github" />
          </a>
        </div>
        <div className={styles.legal}>
          <span>© 2026 Keshav Katwe</span>
          <Link to="/docs/project/licensing">MIT & third-party notices</Link>
          <Link to="/docs/project/changelog">Changelog ↗</Link>
        </div>
      </div>
    </footer>
  );
}

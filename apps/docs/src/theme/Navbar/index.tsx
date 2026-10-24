import Link from "@docusaurus/Link";
import { useLocation } from "@docusaurus/router";
import SiteIcon from "@site/src/components/SiteIcon";
import ColorModeToggle from "@theme/Navbar/ColorModeToggle";
import Logo from "@theme/Navbar/Logo";
import SearchBar from "@theme/SearchBar";
import styles from "./styles.module.css";

export default function Navbar() {
  const { pathname } = useLocation();
  return (
    <header className={`${styles.header} navbar`}>
      <div className={styles.identity}>
        <Logo />
        <Link className={styles.version} to="/docs/project/changelog">
          0.1.0 <span>in development</span>
        </Link>
      </div>
      <nav className={styles.links} aria-label="Main navigation">
        <Link to="/docs/introduction">Documentation</Link>
        <Link to="/docs/examples">Examples</Link>
      </nav>
      <div className={styles.tools}>
        <a
          className={styles.iconLink}
          href="https://github.com/keshavkatwe/toolgrain"
          aria-label="Toolgrain on GitHub"
          title="GitHub"
        >
          <SiteIcon name="github" />
        </a>
        <SearchBar />
        <ColorModeToggle />
      </div>
      <details key={pathname} className={styles.mobile}>
        <summary>
          <span className="sr-only">Open navigation</span>
          <SiteIcon name="menu" />
        </summary>
        <nav aria-label="Mobile navigation">
          <Link to="/docs/introduction">Documentation ↗</Link>
          <Link to="/docs/examples">Examples ↗</Link>
          <a href="https://github.com/keshavkatwe/toolgrain">GitHub ↗</a>
          <span>0.1.0 · In development · Unpublished</span>
        </nav>
      </details>
    </header>
  );
}

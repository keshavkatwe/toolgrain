import type { Props } from "@theme/DocItem/Layout";
import OriginalLayout from "@theme-original/DocItem/Layout";
import styles from "./styles.module.css";
export default function DocItemLayout(props: Props) {
  return (
    <div className={styles.reading}>
      <OriginalLayout {...props} />
    </div>
  );
}

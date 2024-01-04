import { useEffect, useState } from "react";
import { useInView } from "react-intersection-observer";
import { FormattedMessage } from "react-intl";

import messages from "../messages";

export default function LoadMore({
  onLoadMore,
  shouldLoadMore,
  children,
}: {
  onLoadMore: () => void;
  shouldLoadMore: boolean;
  children?: React.ReactNode;
}) {
  const { ref, inView } = useInView({ rootMargin: "2000px" });
  const [tick, setTick] = useState<number>(0);

  useEffect(() => {
    if (inView === true && shouldLoadMore === true) {
      onLoadMore();
    }
  }, [inView, shouldLoadMore, tick]);

  useEffect(() => {
    const t = setInterval(() => {
      setTick(x => (x += 1));
    }, 500);
    return () => clearInterval(t);
  }, []);

  return (
    <div ref={ref} className="mb10">
      {children ?? <FormattedMessage {...messages.Loading} />}
    </div>
  );
}

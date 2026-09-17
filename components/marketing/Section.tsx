/**
 * A numbered marketing section: mono eyebrow, heading, optional lede, body.
 * Server component; the number is part of the design, not decoration — it is
 * how a long page reads as a sequence rather than a pile.
 */
export default function Section({
  id,
  n,
  eyebrow,
  title,
  lede,
  className,
  children,
}: {
  id: string;
  n: string;
  eyebrow: string;
  title: React.ReactNode;
  lede?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className={`mk-section${className ? ` ${className}` : ""}`}>
      <div className="mk-wrap">
        <div className="mk-section-head">
          <p className="mk-eyebrow">
            <span className="n">{n}</span>
            {eyebrow}
          </p>
          <h2>{title}</h2>
          {lede ? <p className="mk-lede">{lede}</p> : null}
        </div>
        {children}
      </div>
    </section>
  );
}

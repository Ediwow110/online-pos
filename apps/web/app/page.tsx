const features = [
  {
    number: "01",
    title: "Sell without slowing down",
    text: "A focused cashier workspace for fast product lookup, split payments, receipts, and every normal sale.",
  },
  {
    number: "02",
    title: "Know what is in stock",
    text: "An append-only inventory trail keeps balances trustworthy and makes low-stock action obvious.",
  },
  {
    number: "03",
    title: "Run the whole day",
    text: "Open shifts, reconcile cash, understand customers, and get the decisions that matter in one calm view.",
  },
];

const stats = [
  ["₱128,420", "Sales today"],
  ["342", "Orders completed"],
  ["98.7%", "Stock accuracy"],
];

export default function Home() {
  return (
    <main>
      <nav className="nav shell" aria-label="Main navigation">
        <a className="brand" href="/" aria-label="Ledgerly home">
          <span className="brand-mark">L</span>
          <span>ledgerly</span>
        </a>
        <div className="nav-links">
          <a href="#why-ledgerly">Why Ledgerly</a>
          <a href="#how-it-works">How it works</a>
          <a href="#contact">Contact</a>
        </div>
        <a className="nav-login" href="/login">Sign in <span aria-hidden="true">↗</span></a>
      </nav>

      <section className="hero shell">
        <div className="hero-copy">
          <p className="eyebrow"><span className="eyebrow-dot" /> Built for the daily loop</p>
          <h1>Run your store<br /><em>with clarity.</em></h1>
          <p className="hero-text">
            Ledgerly brings selling, stock, cash, and customer history into one dependable
            workspace—so you can spend less time reconciling and more time growing.
          </p>
          <div className="hero-actions">
            <a className="button button-dark" href="/signup">Start for free <span>→</span></a>
            <a className="text-link" href="#how-it-works">See how it works <span>↓</span></a>
          </div>
          <p className="fine-print">No credit card required <span>·</span> Set up in minutes</p>
        </div>
        <div className="hero-visual" aria-label="Ledgerly dashboard preview">
          <div className="dashboard-window">
            <div className="window-top"><span className="window-brand">ledgerly</span><span className="window-date">Today, 24 September 2026 <b>⌄</b></span></div>
            <div className="window-body">
              <div className="window-greeting"><div><span>Good morning, Maria</span><strong>Here&apos;s your store at a glance.</strong></div><span className="avatar">M</span></div>
              <div className="stat-grid">{stats.map(([value, label]) => <div className="stat" key={label}><strong>{value}</strong><span>{label}</span></div>)}</div>
              <div className="chart-card"><div className="card-heading"><span>Sales overview</span><small>Last 7 days&nbsp; ⌄</small></div><div className="chart"><div className="chart-fill" /><div className="chart-line" /><div className="chart-labels"><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span></div></div></div>
              <div className="attention"><span className="attention-icon">!</span><span><b>3 items need attention</b><small>Low stock across 2 categories</small></span><span className="attention-arrow">→</span></div>
            </div>
          </div>
          <div className="floating-note"><span className="check">✓</span><span><b>Shift reconciled</b><small>Everything balanced</small></span></div>
        </div>
      </section>

      <section className="trust-bar shell"><span>Made for businesses that care about the details</span><div><b>PHILIPPINES-FIRST</b><b>₱ PHP READY</b><b>BUILT TO SCALE</b></div></section>

      <section className="feature-section shell" id="why-ledgerly">
        <div className="section-intro"><p className="eyebrow">One system, fewer loose ends</p><h2>The details are the difference.</h2><p>From the first sale of the day to the last cash count, Ledgerly gives your team the context to act with confidence.</p></div>
        <div className="features">{features.map((feature) => <article className="feature" key={feature.number}><span className="feature-number">{feature.number}</span><h3>{feature.title}</h3><p>{feature.text}</p><a href="/signup">Explore feature <span>↗</span></a></article>)}</div>
      </section>

      <section className="loop-section" id="how-it-works">
        <div className="shell loop-content"><div><p className="eyebrow eyebrow-light">The daily loop</p><h2>Everything connected.<br /><em>Nothing overlooked.</em></h2></div><div className="loop-steps">{["Set up your business", "Add products & stock", "Open shift & sell", "Close & understand"].map((step, index) => <div className="loop-step" key={step}><span>0{index + 1}</span><b>{step}</b>{index < 3 && <i>→</i>}</div>)}</div></div>
      </section>

      <section className="final-cta shell" id="contact"><p className="eyebrow">Ready when you are</p><h2>Make today easier<br /><em>than yesterday.</em></h2><a className="button button-dark" href="/signup">Start for free <span>→</span></a></section>
      <footer className="footer shell"><a className="brand" href="/"><span className="brand-mark">L</span><span>ledgerly</span></a><span>© 2026 Ledgerly. Built for better business.</span><div><a href="/login">Sign in</a><a href="#contact">Contact</a></div></footer>
    </main>
  );
}

import Link from 'next/link';

export default function UnauthorisedPage() {
  return (
    <div className="loginWrap" style={{ position: 'fixed', inset: 0, zIndex: 100 }}>
      <div className="loginCard">
        <h1>Access not authorised</h1>
        <p>This account is not approved to access the TyreOps Control Centre.</p>
        <Link className="btn primary" href="/login">Return to login</Link>
      </div>
    </div>
  );
}

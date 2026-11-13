import { Component, type ReactNode } from 'react';

/** Keeps a failing panel from blanking the whole page. */
export class ErrorBoundary extends Component<
  { children: ReactNode; label: string },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" style={{ padding: 16 }}>
        <p>
          The {this.props.label} panel hit an error: {this.state.error.message}
        </p>
        <button type="button" onClick={() => this.setState({ error: null })}>
          Try again
        </button>
      </div>
    );
  }
}

import React from 'react';
export class RenderBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidUpdate(previous) { if (this.state.failed && previous.reset !== this.props.reset) this.setState({ failed: false }); }
  render() { return this.state.failed ? <div className="chart-empty" role="alert"><p>This board could not be displayed.</p><button type="button" className="button secondary" onClick={() => this.setState({ failed: false })}>Try again</button></div> : this.props.children; }
}

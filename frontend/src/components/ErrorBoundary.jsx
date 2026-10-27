import React, { Component } from 'react';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error: error };
  }

  componentDidCatch(error, info) {
    console.error('Error caught by ErrorBoundary:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return <div className='fixed inset-0 flex items-center justify-center bg-white/90 text-red-600 z-50'>
        <div className='text-center p-8'>
          <h3 className='text-xl font-bold mb-4'>Erro ao carregar página</h3>
          <p className='text-slate-600 mb-6'>Ocorreu um erro inesperado. Tentando recuperar...</p>
          <button className='bg-brand-600 text-white px-6 py-2 rounded hover:bg-brand-700' onClick={() => window.location.reload()}>
            Tentar novamente
          </button>
        </div>
      </div>;
    }
    return this.props.children;
  }
}

export default ErrorBoundary;

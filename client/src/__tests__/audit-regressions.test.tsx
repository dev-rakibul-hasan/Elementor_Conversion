import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Input } from '../components/ui/input';
import { Modal } from '../components/ui/modal';
import { StageProgress } from '../components/conversion/stage-progress';
import { useAuthStore } from '../store/auth';
import { apiClient } from '../lib/api';

afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); useAuthStore.getState().logout(); });

describe('Audit UI regressions', () => {
  it('gives identically labelled inputs unique IDs', () => {
    render(<><Input label="Name" /><Input label="Name" /></>);
    const inputs = screen.getAllByLabelText('Name');
    expect(inputs[0].id).not.toBe(inputs[1].id);
  });

  it('keeps authentication usable when browser storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage blocked'); });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('Storage blocked'); });
    const user = { id: 'audit-user', email: 'audit@example.test' };
    expect(() => useAuthStore.getState().setAuth(user, 'test-token')).not.toThrow();
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(() => useAuthStore.getState().logout()).not.toThrow();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('does not treat malformed stored user data as authenticated', () => {
    localStorage.setItem('dte_token', 'token');
    localStorage.setItem('dte_user', '{"unexpected":"value"}');
    useAuthStore.getState().initialize();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('attaches the in-memory session token to API requests', async () => {
    useAuthStore.getState().setAuth({ id: 'audit-user', email: 'audit@example.test' }, 'session-token');
    localStorage.clear();
    const adapter = vi.fn().mockImplementation(async (config) => ({ status: 200, statusText: 'OK', data: {}, headers: {}, config }));
    await apiClient.get('/test', { adapter });
    expect(adapter.mock.calls[0][0].headers.Authorization).toBe('Bearer session-token');
  });

  it('traps dialog focus, handles Escape, and restores focus and scroll state', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger); trigger.focus();
    document.body.style.overflow = 'auto';
    const close = vi.fn();
    const { unmount } = render(<Modal isOpen onClose={close} title="Audit dialog"><button>Last action</button></Modal>);
    const first = screen.getByLabelText('Close dialog');
    const last = screen.getByText('Last action');
    expect(document.activeElement).toBe(first);
    last.focus(); fireEvent.keyDown(window, { key: 'Tab' });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(window, { key: 'Escape' }); expect(close).toHaveBeenCalledTimes(1);
    unmount();
    expect(document.body.style.overflow).toBe('auto');
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it('never labels a cancelled stage as still processing', () => {
    render(<StageProgress overallStatus="cancelled" currentStage="dir_generation" stages={[]} />);
    expect(screen.queryByText('In Progress')).toBeNull();
    expect(screen.getAllByText('Skipped')).toHaveLength(8);
  });
});

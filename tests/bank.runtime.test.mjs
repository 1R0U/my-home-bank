import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import renderer from 'react-test-renderer';
import { Alert } from 'react-native';

test('BankScreen runtime behavior: balances and handlers', async () => {
  // Ensure our mock router's push mock is accessible
  const { router } = await import('../node_modules/expo-router/index.js');
  // Spy on Alert
  const alerts = [];
  const originalAlert = Alert.alert;
  Alert.alert = (title, msg) => alerts.push({ title, msg });

  // Provide a push mock
  let pushed = [];
  router._pushMock = (p) => pushed.push(p);

  const Bank = (await import('../app/bank.tsx')).default;

  const tree = renderer.create(React.createElement(Bank));

  // Check wallet text exists
  const json = tree.toJSON();
  const jsonStr = JSON.stringify(json);
  assert.ok(jsonStr.includes('現在の所持金'), 'wallet text present');

  // Find and trigger buttons by searching rendered tree
  function findByText(node, text) {
    if (!node) return null;
    if (node.type === 'Text' && typeof node.children === 'object') {
      const combined = (node.children || []).join('');
      if (combined.includes(text)) return node;
    }
    if (Array.isArray(node)) {
      for (const c of node) {
        const r = findByText(c, text);
        if (r) return r;
      }
    }
    if (node.children) return findByText(node.children, text);
    return null;
  }

  const depositBtn = findByText(json, '預入');
  const withdrawBtn = findByText(json, '引き出し');
  const borrowBtn = findByText(json, '借り入れ');
  const repayBtn = findByText(json, '返済');
  const backBtn = findByText(json, '戻る');

  // Simulate pressing by invoking onPress from cloned elements
  function press(node) {
    if (!node) return;
    // find parent with props.onPress
    function findPress(n) {
      if (!n) return null;
      if (n.props && typeof n.props.onPress === 'function') return n.props.onPress;
      if (Array.isArray(n)) {
        for (const c of n) {
          const r = findPress(c);
          if (r) return r;
        }
      }
      if (n.children) return findPress(n.children);
      return null;
    }
    const handler = findPress(node);
    if (handler) handler();
  }

  press(depositBtn);
  press(withdrawBtn);
  press(borrowBtn);
  press(repayBtn);
  press(backBtn);

  assert.ok(alerts.length >= 4, 'Alert called for action buttons');
  assert.ok(pushed.includes('/'), 'Back navigated to /');

  // restore
  Alert.alert = originalAlert;
});

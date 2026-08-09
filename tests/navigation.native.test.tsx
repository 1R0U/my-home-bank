import React from 'react';
// Place mocks before importing app files to ensure hoisting
jest.mock('../store', () => ({ useActiveRole: jest.fn() }));
jest.mock('../components/ChildHomeScreen', () => () => React.createElement('View', null, React.createElement('Text', null, 'ChildPlaceholder')));
jest.mock('../components/ParentHomeScreen', () => () => React.createElement('View', null, React.createElement('Text', null, 'ParentPlaceholder')));

import { render, fireEvent } from '@testing-library/react-native';
import Home from '../app/index';
import Bank from '../app/bank';
import { router } from 'expo-router';

test('Home -> pressing bank link calls router.push(/bank) when role is undefined', () => {
  const { useActiveRole } = require('../store');
  useActiveRole.mockReturnValue(undefined);

  const { getByText } = render(<Home />);
  const btn = getByText('銀行に行く');
  fireEvent.press(btn);
  expect(router.push).toHaveBeenCalledWith('/bank');
});

test('BankScreen: displays balances and alerts/back navigation work', () => {
  const { getByText } = render(<Bank />);
  const deposit = getByText('預入');
  const withdraw = getByText('引き出し');
  const borrow = getByText('借り入れ');
  const repay = getByText('返済');
  const back = getByText('戻る');

  const Alert = require('react-native').Alert;
  const spy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

  fireEvent.press(deposit);
  fireEvent.press(withdraw);
  fireEvent.press(borrow);
  fireEvent.press(repay);
  expect(spy).toHaveBeenCalled();

  fireEvent.press(back);
  expect(router.push).toHaveBeenCalledWith('/');

  spy.mockRestore();
});

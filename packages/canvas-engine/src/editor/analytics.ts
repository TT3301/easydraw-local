/** Local builds do not collect or transmit analytics. */
export const trackEvent = (
  _category: string,
  _action: string,
  _label?: string,
  _value?: number,
): void => {};

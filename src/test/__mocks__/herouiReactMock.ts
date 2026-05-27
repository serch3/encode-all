/* eslint-disable @typescript-eslint/no-explicit-any */
// Minimal mock of @heroui/react components used in tests
import React from 'react'

type AnyProps = Record<string, any>

const createElement = (tag: string) =>
  function MockComponent(props: AnyProps): React.JSX.Element {
    return React.createElement(tag, props)
  }

const toBool = (value: unknown): boolean => value === true || value === 'true'

const Div = createElement('div')
const Span = createElement('span')
const Option = createElement('option')
const HR = createElement('hr')

const overlayComponent = (tag: string) =>
  function Overlay({
    isOpen = true,
    onOpenChange,
    onClose,
    isDismissable,
    isKeyboardDismissDisabled,
    placement,
    children,
    ...rest
  }: AnyProps): React.JSX.Element | null {
    void isDismissable
    void isKeyboardDismissDisabled
    if (!isOpen) {
      if (typeof onOpenChange === 'function') {
        onOpenChange(false)
      }
      return null
    }
    const domProps = {
      ...rest,
      'data-placement': placement
    }
    void onClose
    return React.createElement(tag, domProps, children as React.ReactNode)
  }

export const Modal = overlayComponent('div')
export const ModalContent = Div
export const ModalHeader = Div
export const ModalBody = Div
export const ModalFooter = Div

export const Drawer = overlayComponent('div')
export const DrawerContent = Div
export const DrawerHeader = Div
export const DrawerBody = Div
export const DrawerFooter = Div

export const ScrollShadow = Div
export const Tooltip = function Tooltip({ content, children }: AnyProps): React.JSX.Element {
  return React.createElement('div', { 'data-tooltip': content }, children as React.ReactNode)
}
export const ButtonGroup = function ButtonGroup({
  children,
  isDisabled,
  ...rest
}: AnyProps): React.JSX.Element {
  void isDisabled
  return React.createElement('div', { role: 'group', ...rest }, children as React.ReactNode)
}

export const HeroUIProvider = function HeroUIProvider({ children }: AnyProps): React.JSX.Element {
  return React.createElement(React.Fragment, null, children as React.ReactNode)
}

export const Chip = Span
export const Divider = HR
export const Progress = function Progress({
  isIndeterminate,
  value,
  ...rest
}: AnyProps): React.JSX.Element {
  return React.createElement('progress', {
    value: toBool(isIndeterminate) ? undefined : value,
    'data-indeterminate': toBool(isIndeterminate) ? 'true' : undefined,
    ...rest
  })
}

export const Button = function Button({
  onPress,
  onClick,
  isDisabled,
  isLoading,
  startContent,
  endContent,
  children,
  ...rest
}: AnyProps): React.JSX.Element {
  const disabled = toBool(isDisabled) || toBool(isLoading)

  // strip non-DOM props that would trigger React warnings
  const { isIconOnly, color, variant, size, radius, ...domRest } = rest
  void isIconOnly
  void color
  void variant
  void size
  void radius

  return React.createElement(
    'button',
    {
      type: 'button',
      disabled,
      onClick: (event: React.MouseEvent<HTMLButtonElement>) => {
        if (disabled) return
        if (typeof onPress === 'function') {
          onPress(event)
        } else if (typeof onClick === 'function') {
          onClick(event)
        }
      },
      ...domRest
    },
    isLoading
      ? 'Loading…'
      : React.createElement(React.Fragment, null, startContent, children, endContent)
  )
}

export const Card = function Card({
  onPress,
  onClick,
  children,
  isPressable,
  ...rest
}: AnyProps): React.JSX.Element {
  const resolvedRole = rest.role ?? (isPressable ? 'button' : undefined)
  const resolvedTabIndex = rest.tabIndex ?? (isPressable ? 0 : undefined)

  const handleActivate = (
    event: React.MouseEvent<HTMLDivElement> | React.KeyboardEvent<HTMLDivElement>
  ): void => {
    if (typeof onPress === 'function') {
      onPress(event)
    } else if (typeof onClick === 'function') {
      onClick(event)
    }
  }

  return React.createElement(
    'div',
    {
      role: resolvedRole,
      tabIndex: resolvedTabIndex,
      onClick: handleActivate,
      onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'Enter' || event.key === ' ') {
          handleActivate(event)
        }
      },
      'data-pressable': isPressable ? 'true' : undefined,
      ...rest
    },
    children as React.ReactNode
  )
}

export const CardBody = function CardBody({ children, ...rest }: AnyProps): React.JSX.Element {
  return React.createElement('div', rest, children as React.ReactNode)
}

export const CardHeader = function CardHeader({ children, ...rest }: AnyProps): React.JSX.Element {
  return React.createElement('div', rest, children as React.ReactNode)
}

export const Select = function Select({
  onSelectionChange,
  children,
  selectedKeys,
  isDisabled,
  label,
  description,
  ...rest
}: AnyProps): React.JSX.Element {
  const value = Array.isArray(selectedKeys)
    ? selectedKeys[0]
    : selectedKeys instanceof Set
      ? [...selectedKeys][0]
      : ''

  return React.createElement(
    'select',
    {
      value,
      disabled: Boolean(isDisabled),
      'aria-label': label,
      'data-description': description,
      onChange: (event: React.ChangeEvent<HTMLSelectElement>) => {
        const selectedValue = event.target.value
        onSelectionChange?.(new Set([selectedValue]))
      },
      ...rest
    },
    children as React.ReactNode
  )
}

export const SelectItem = function SelectItem(props: AnyProps): React.JSX.Element {
  return React.createElement(Option, props)
}

export const Input = function Input({
  value,
  onChange,
  onValueChange,
  onClear,
  isClearable,
  label,
  description,
  isDisabled,
  startContent,
  endContent,
  classNames,
  ...rest
}: AnyProps): React.JSX.Element {
  void startContent
  void endContent
  void isClearable
  void onClear
  void classNames

  const handleChange =
    typeof onChange === 'function'
      ? onChange
      : (event: React.ChangeEvent<HTMLInputElement>) =>
          typeof onValueChange === 'function' && onValueChange(event.target.value)

  return React.createElement('input', {
    value,
    onChange: handleChange,
    disabled: toBool(isDisabled),
    'aria-label': label,
    'data-description': description,
    ...rest
  })
}

export const Tabs = function Tabs({ children }: AnyProps): React.JSX.Element {
  return React.createElement('div', null, children as React.ReactNode)
}

export const Tab = function Tab({ children }: AnyProps): React.JSX.Element {
  return React.createElement('div', null, children as React.ReactNode)
}

export const RadioGroup = function RadioGroup({ children, ...rest }: AnyProps): React.JSX.Element {
  return React.createElement('div', { role: 'radiogroup', ...rest }, children as React.ReactNode)
}

export const Radio = function Radio({ value, children, ...rest }: AnyProps): React.JSX.Element {
  return React.createElement('label', null, [
    React.createElement('input', { type: 'radio', value, key: 'input', ...rest }),
    React.createElement('span', { key: 'label' }, children as React.ReactNode)
  ])
}

export const Checkbox = function Checkbox({
  isSelected,
  onValueChange,
  isDisabled,
  children,
  ...rest
}: AnyProps): React.JSX.Element {
  return React.createElement('label', null, [
    React.createElement('input', {
      type: 'checkbox',
      checked: Boolean(isSelected),
      disabled: toBool(isDisabled),
      onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
        typeof onValueChange === 'function' && onValueChange(e.target.checked),
      key: 'input',
      ...rest
    }),
    React.createElement('span', { key: 'label' }, children as React.ReactNode)
  ])
}

export const Spinner = function Spinner({ size, color, ...rest }: AnyProps): React.JSX.Element {
  void size
  void color
  return React.createElement('span', { role: 'status', 'aria-label': 'Loading', ...rest })
}

export const Switch = function Switch({
  isSelected,
  onValueChange,
  isDisabled,
  thumbIcon,
  ...rest
}: AnyProps): React.JSX.Element {
  void thumbIcon
  return React.createElement('input', {
    type: 'checkbox',
    role: 'switch',
    checked: Boolean(isSelected),
    disabled: toBool(isDisabled),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      typeof onValueChange === 'function' && onValueChange(e.target.checked),
    ...rest
  })
}

export const cn = (...classes: Array<string | false | null | undefined>): string => {
  return classes.filter(Boolean).join(' ')
}

const mock = {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerBody,
  DrawerFooter,
  HeroUIProvider,
  ScrollShadow,
  Tooltip,
  ButtonGroup,
  Button,
  Card,
  CardBody,
  CardHeader,
  Progress,
  Chip,
  Divider,
  Select,
  SelectItem,
  Input,
  Tabs,
  Tab,
  RadioGroup,
  Radio,
  Switch,
  Checkbox,
  Spinner,
  cn
}

export default mock

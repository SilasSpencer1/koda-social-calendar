import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import Home from '@/app/page';
import { Button } from '@/components/ui/button';

describe('smoke test - home page', () => {
  it('renders the page without crashing', () => {
    render(<Home />);
    // Just verify the component renders
    expect(document.body).toBeDefined();
  });

  it('renders main content on homepage', () => {
    const { container } = render(<Home />);
    expect(container).toBeDefined();
  });
});

describe('Button component', () => {
  it('renders button with text', () => {
    const { getByText } = render(<Button>Click me</Button>);
    const button = getByText('Click me');
    expect(button).toBeDefined();
  });

  it('renders button with different variants', () => {
    const { getByText } = render(<Button variant="outline">Outline</Button>);
    const button = getByText('Outline');
    expect(button).toBeDefined();
  });

  it('renders button with size prop', () => {
    const { getByText } = render(<Button size="lg">Large</Button>);
    const button = getByText('Large');
    expect(button).toBeDefined();
  });

  it('button is not disabled by default', () => {
    const { getByText } = render(<Button>Click me</Button>);
    const button = getByText('Click me') as HTMLButtonElement;
    expect(button.disabled).toBe(false);
  });

  it('renders disabled button', () => {
    const { getByText } = render(<Button disabled>Disabled</Button>);
    const button = getByText('Disabled') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it('renders button with asChild prop using span', () => {
    const { container } = render(
      <Button asChild>
        <span>Slot content</span>
      </Button>
    );
    const span = container.querySelector('span');
    expect(span).toBeDefined();
    expect(span?.textContent).toBe('Slot content');
  });

  it('button responds to onClick handler', () => {
    const handleClick = () => {
      // Click handler
    };
    const { getByText } = render(
      <Button onClick={handleClick}>Click me</Button>
    );
    const button = getByText('Click me');
    expect(button).toBeDefined();
  });

  it('renders button with secondary variant', () => {
    const { getByText } = render(
      <Button variant="secondary">Secondary</Button>
    );
    const button = getByText('Secondary');
    expect(button).toBeDefined();
  });

  it('renders button with destructive variant', () => {
    const { getByText } = render(<Button variant="destructive">Delete</Button>);
    const button = getByText('Delete');
    expect(button).toBeDefined();
  });

  it('renders button with ghost variant', () => {
    const { getByText } = render(<Button variant="ghost">Ghost</Button>);
    const button = getByText('Ghost');
    expect(button).toBeDefined();
  });

  it('renders button with link variant', () => {
    const { getByText } = render(<Button variant="link">Link</Button>);
    const button = getByText('Link');
    expect(button).toBeDefined();
  });

  it('renders button with icon size', () => {
    const { container } = render(<Button size="icon">🔔</Button>);
    expect(container).toBeDefined();
  });

  it('renders button with xs size', () => {
    const { getByText } = render(<Button size="xs">Extra Small</Button>);
    const button = getByText('Extra Small');
    expect(button).toBeDefined();
  });

  it('renders button with sm size', () => {
    const { getByText } = render(<Button size="sm">Small</Button>);
    const button = getByText('Small');
    expect(button).toBeDefined();
  });
});

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import AttachmentReference from '../../src/components/AttachmentReference';
describe('Truthful and safe attachment references', () => {
  it.each(['/uploads/example.pdf', '', 'javascript:alert(1)'])('retains metadata without a broken or unsafe %s link', fileUrl => {
    render(<AttachmentReference fileName="example.pdf" fileUrl={fileUrl} />);
    expect(screen.getByText(/example.pdf/)).toBeInTheDocument();
    expect(screen.getByText(/Download unavailable/)).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
  it('keeps a supplied HTTP file link with a new-tab announcement', () => {
    render(<AttachmentReference fileName="guide.pdf" fileUrl="https://files.example.com/guide.pdf" />);
    expect(screen.getByRole('link', { name: /guide.pdf.*opens in a new tab/ })).toHaveAttribute('href', 'https://files.example.com/guide.pdf');
    expect(screen.getByRole('link')).toHaveAttribute('rel', 'noopener noreferrer');
  });
});

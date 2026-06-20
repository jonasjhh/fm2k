import { render, screen, fireEvent } from '@testing-library/react';
import SlotLabel from './SlotLabel';

function noop() {}

describe('SlotLabel:', () => {
  test('renders the position label', () => {
    render(<SlotLabel index={0} position="GK" player={null} isSub={false} isDragging={false}
      onDragStart={noop} onDragEnd={noop} onClick={noop} />);
    expect(screen.getByText('GK')).toBeInTheDocument();
  });

  test('onClick fires with this slot\'s index', () => {
    const onClick = vi.fn();
    render(<SlotLabel index={4} position="CM" player={null} isSub={false} isDragging={false}
      onDragStart={noop} onDragEnd={noop} onClick={onClick} />);
    fireEvent.click(screen.getByText('CM'));
    expect(onClick).toHaveBeenCalledWith(4);
  });

  test('onDragStart fires with this slot\'s index', () => {
    const onDragStart = vi.fn();
    render(<SlotLabel index={7} position="ST" player={null} isSub={false} isDragging={false}
      onDragStart={onDragStart} onDragEnd={noop} onClick={noop} />);
    fireEvent.dragStart(screen.getByText('ST'));
    expect(onDragStart).toHaveBeenCalledWith(7);
  });

  test('onDragEnd fires on drag end', () => {
    const onDragEnd = vi.fn();
    render(<SlotLabel index={1} position="LB" player={null} isSub={false} isDragging={false}
      onDragStart={noop} onDragEnd={onDragEnd} onClick={noop} />);
    fireEvent.dragEnd(screen.getByText('LB'));
    expect(onDragEnd).toHaveBeenCalled();
  });
});

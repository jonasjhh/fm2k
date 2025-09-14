import { Timeline, Moment } from './timeline';

describe('Timeline', () => {
  test('should register and retrieve moments', () => {
    // Arrange
    const timeline = new Timeline(new Date('2024-01-01'));
    const moment: Moment = {
      id: 'test-1',
      name: 'Test Moment',
      date: new Date('2024-01-05'),
      resolved: false,
      callback: () => { /* test callback */ },
    };

    // Act
    timeline.registerMoment(moment);
    const moments = timeline.getMomentsForDate(new Date('2024-01-05'));

    // Assert
    expect(moments).toHaveLength(1);
    expect(moments[0].id).toBe('test-1');
  });

  test('should advance time and trigger moments', () => {
    // Arrange
    const timeline = new Timeline(new Date('2024-01-01'));
    const moment: Moment = {
      id: 'test-2',
      name: 'Future Moment',
      date: new Date('2024-01-03'),
      resolved: false,
      callback: () => { /* test callback */ },
    };

    // Act
    timeline.registerMoment(moment);
    const triggeredMoments = timeline.advanceTime(3);

    // Assert
    expect(triggeredMoments).toHaveLength(1);
    expect(triggeredMoments[0].id).toBe('test-2');
  });

  test('should remove moments by id', () => {
    // Arrange
    const timeline = new Timeline();
    const moment: Moment = {
      id: 'remove-test',
      name: 'Moment to Remove',
      date: new Date('2024-01-01'),
      resolved: false,
      callback: () => { /* test callback */ },
    };

    // Act
    timeline.registerMoment(moment);
    const removed = timeline.removeMoment('remove-test');
    const remainingMoments = timeline.getMomentsForDate(new Date('2024-01-01'));

    // Assert
    expect(removed).toBe(true);
    expect(remainingMoments).toHaveLength(0);
  });

  test('should return false when trying to remove non-existent moment', () => {
    // Arrange
    const timeline = new Timeline();

    // Act
    const removed = timeline.removeMoment('non-existent');

    // Assert
    expect(removed).toBe(false);
  });

  test('should handle multiple moments on the same date', () => {
    // Arrange
    const timeline = new Timeline(new Date('2024-01-01'));
    const moment1: Moment = {
      id: 'multi-1',
      name: 'First Moment',
      date: new Date('2024-01-02'),
      resolved: false,
      callback: () => { /* test callback */ },
    };
    const moment2: Moment = {
      id: 'multi-2',
      name: 'Second Moment',
      date: new Date('2024-01-02'),
      resolved: false,
      callback: () => { /* test callback */ },
    };

    // Act
    timeline.registerMoment(moment1);
    timeline.registerMoment(moment2);
    const moments = timeline.getMomentsForDate(new Date('2024-01-02'));

    // Assert
    expect(moments).toHaveLength(2);
    expect(moments.map(m => m.id)).toContain('multi-1');
    expect(moments.map(m => m.id)).toContain('multi-2');
  });

  test('should return moments in chronological order when advancing time', () => {
    // Arrange
    const timeline = new Timeline(new Date('2024-01-01'));

    const moment1: Moment = {
      id: 'first',
      name: 'First Moment',
      date: new Date('2024-01-02'),
      resolved: false,
      callback: () => { /* test callback */ },
    };

    const moment2: Moment = {
      id: 'second',
      name: 'Second Moment',
      date: new Date('2024-01-03'),
      resolved: false,
      callback: () => { /* test callback */ },
    };

    const moment3: Moment = {
      id: 'third',
      name: 'Third Moment',
      date: new Date('2024-01-04'),
      resolved: false,
      callback: () => { /* test callback */ },
    };

    // Act
    timeline.registerMoment(moment3); // Register out of order
    timeline.registerMoment(moment1);
    timeline.registerMoment(moment2);

    const triggeredMoments = timeline.advanceTime(5); // Advance past all moments

    // Assert
    expect(triggeredMoments).toHaveLength(3);
    expect(triggeredMoments.map(m => m.id)).toEqual(['first', 'second', 'third']);
  });

  test('should allow marking moments as resolved manually', () => {
    // Arrange
    const timeline = new Timeline(new Date('2024-01-01'));
    const moment: Moment = {
      id: 'resolve-test',
      name: 'Moment to Resolve',
      date: new Date('2024-01-02'),
      resolved: false,
      callback: () => { /* test callback */ },
    };

    // Act
    timeline.registerMoment(moment);
    const wasResolved = timeline.resolveMoment('resolve-test');

    // Assert
    expect(wasResolved).toBe(true);
    expect(moment.resolved).toBe(true);
  });

  test('should not trigger already resolved moments', () => {
    // Arrange
    const timeline = new Timeline(new Date('2024-01-01'));
    const moment: Moment = {
      id: 'resolved-test',
      name: 'Already Resolved',
      date: new Date('2024-01-02'),
      resolved: true, // Already resolved
      callback: jest.fn(), // Mock function to track calls
    };

    // Act
    timeline.registerMoment(moment);
    timeline.advanceTime(2);

    // Assert
    expect(moment.callback).not.toHaveBeenCalled();
  });

  test('should handle empty timeline', () => {
    // Arrange
    const timeline = new Timeline(new Date('2024-01-01'));

    // Act
    const triggeredMoments = timeline.advanceTime(10);
    const moments = timeline.getMomentsForDate(new Date('2024-01-05'));

    // Assert
    expect(triggeredMoments).toHaveLength(0);
    expect(moments).toHaveLength(0);
  });

  test('should get current date', () => {
    // Arrange
    const startDate = new Date('2024-01-01');
    const timeline = new Timeline(startDate);

    // Act
    const currentDate = timeline.getCurrentDate();

    // Assert
    expect(currentDate).toEqual(startDate);
  });

  test('should update current date when advancing time', () => {
    // Arrange
    const startDate = new Date('2024-01-01');
    const timeline = new Timeline(startDate);

    // Act
    timeline.advanceTime(5);
    const currentDate = timeline.getCurrentDate();

    // Assert
    const expectedDate = new Date('2024-01-06');
    expect(currentDate.getTime()).toBe(expectedDate.getTime());
  });

  test('should handle moments with past dates', () => {
    // Arrange
    const timeline = new Timeline(new Date('2024-01-10'));
    const pastMoment: Moment = {
      id: 'past',
      name: 'Past Moment',
      date: new Date('2024-01-05'), // Before current date
      resolved: false,
      callback: jest.fn(),
    };

    // Act
    timeline.registerMoment(pastMoment);
    const triggeredMoments = timeline.advanceTime(1);

    // Assert
    expect(triggeredMoments).toHaveLength(0);
    expect(pastMoment.callback).not.toHaveBeenCalled();
  });

  test('should return moments when advancing to date they are registered for', () => {
    // Arrange
    const currentDate = new Date('2024-01-01');
    const timeline = new Timeline(currentDate);
    const futureMoment: Moment = {
      id: 'future-date',
      name: 'Future Date Moment',
      date: new Date('2024-01-02'),
      resolved: false,
      callback: jest.fn(),
    };

    // Act
    timeline.registerMoment(futureMoment);
    const triggeredMoments = timeline.advanceTime(1);

    // Assert
    expect(triggeredMoments).toHaveLength(1);
    expect(triggeredMoments[0].id).toBe('future-date');
  });

  test('should create timeline with default current date', () => {
    // Act
    const timeline = new Timeline();
    const currentDate = timeline.getCurrentDate();

    // Assert
    expect(currentDate).toBeInstanceOf(Date);
  });
});

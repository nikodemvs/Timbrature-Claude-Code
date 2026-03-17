import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../utils/colors';
import { format, getDaysInMonth, startOfMonth, getDay } from 'date-fns';
import { it } from 'date-fns/locale';

interface DatePickerFieldProps {
  label?: string;
  value: string;
  onChange: (dateString: string) => void;
  placeholder?: string;
  minimumDate?: Date;
  maximumDate?: Date;
}

export const DatePickerField: React.FC<DatePickerFieldProps> = ({
  label,
  value,
  onChange,
  placeholder = 'Seleziona data',
  minimumDate,
  maximumDate,
}) => {
  const [showPicker, setShowPicker] = useState(false);
  const [viewDate, setViewDate] = useState(() => {
    if (value) {
      return new Date(value);
    }
    return new Date();
  });

  const currentDate = value ? new Date(value) : null;

  const displayValue = value
    ? format(new Date(value), 'dd MMMM yyyy', { locale: it })
    : placeholder;

  const daysInMonth = getDaysInMonth(viewDate);
  const firstDayOfMonth = getDay(startOfMonth(viewDate));
  const adjustedFirstDay = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;

  const days = [];
  for (let i = 0; i < adjustedFirstDay; i++) {
    days.push(null);
  }
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(i);
  }

  const handleSelectDay = (day: number) => {
    const newDate = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);
    const dateString = format(newDate, 'yyyy-MM-dd');
    onChange(dateString);
    setShowPicker(false);
  };

  const prevMonth = () => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
  };

  const isSelected = (day: number) => {
    if (!currentDate || !day) return false;
    return (
      currentDate.getDate() === day &&
      currentDate.getMonth() === viewDate.getMonth() &&
      currentDate.getFullYear() === viewDate.getFullYear()
    );
  };

  const isToday = (day: number) => {
    const today = new Date();
    return (
      today.getDate() === day &&
      today.getMonth() === viewDate.getMonth() &&
      today.getFullYear() === viewDate.getFullYear()
    );
  };

  const weekDays = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      <TouchableOpacity
        style={styles.inputContainer}
        onPress={() => setShowPicker(true)}
        activeOpacity={0.7}
      >
        <Ionicons name="calendar" size={20} color={COLORS.textSecondary} style={styles.icon} />
        <Text style={[styles.inputText, !value && styles.placeholder]}>
          {displayValue}
        </Text>
        <Ionicons name="chevron-down" size={20} color={COLORS.textSecondary} />
      </TouchableOpacity>

      <Modal
        visible={showPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPicker(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowPicker(false)}
        >
          <View style={styles.calendarContainer} onStartShouldSetResponder={() => true}>
            <View style={styles.calendarHeader}>
              <TouchableOpacity onPress={prevMonth} style={styles.navButton}>
                <Ionicons name="chevron-back" size={24} color={COLORS.primary} />
              </TouchableOpacity>
              <Text style={styles.monthYearText}>
                {format(viewDate, 'MMMM yyyy', { locale: it })}
              </Text>
              <TouchableOpacity onPress={nextMonth} style={styles.navButton}>
                <Ionicons name="chevron-forward" size={24} color={COLORS.primary} />
              </TouchableOpacity>
            </View>

            <View style={styles.weekDaysRow}>
              {weekDays.map((day) => (
                <Text key={day} style={styles.weekDayText}>
                  {day}
                </Text>
              ))}
            </View>

            <View style={styles.daysGrid}>
              {days.map((day, index) => (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.dayCell,
                    isSelected(day as number) && styles.dayCellSelected,
                    isToday(day as number) && !isSelected(day as number) && styles.dayCellToday,
                  ]}
                  onPress={() => day && handleSelectDay(day as number)}
                  disabled={!day}
                >
                  {day && (
                    <Text
                      style={[
                        styles.dayText,
                        isSelected(day as number) && styles.dayTextSelected,
                        isToday(day as number) && !isSelected(day as number) && styles.dayTextToday,
                      ]}
                    >
                      {day}
                    </Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setShowPicker(false)}
            >
              <Text style={styles.closeButtonText}>Chiudi</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

interface TimePickerFieldProps {
  label?: string;
  value: string;
  onChange: (timeString: string) => void;
  placeholder?: string;
}

export const TimePickerField: React.FC<TimePickerFieldProps> = ({
  label,
  value,
  onChange,
  placeholder = 'Seleziona ora',
}) => {
  const [showPicker, setShowPicker] = useState(false);
  const [selectedHour, setSelectedHour] = useState(() => {
    if (value) {
      return parseInt(value.split(':')[0]) || 8;
    }
    return 8;
  });
  const [selectedMinute, setSelectedMinute] = useState(() => {
    if (value) {
      return parseInt(value.split(':')[1]) || 0;
    }
    return 0;
  });

  const displayValue = value || placeholder;

  const hours = Array.from({ length: 24 }, (_, i) => i);
  const minutes = [0, 15, 30, 45];

  const handleConfirm = () => {
    const timeString = `${selectedHour.toString().padStart(2, '0')}:${selectedMinute.toString().padStart(2, '0')}`;
    onChange(timeString);
    setShowPicker(false);
  };

  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      <TouchableOpacity
        style={styles.inputContainer}
        onPress={() => setShowPicker(true)}
        activeOpacity={0.7}
      >
        <Ionicons name="time" size={20} color={COLORS.textSecondary} style={styles.icon} />
        <Text style={[styles.inputText, !value && styles.placeholder]}>
          {displayValue}
        </Text>
        <Ionicons name="chevron-down" size={20} color={COLORS.textSecondary} />
      </TouchableOpacity>

      <Modal
        visible={showPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPicker(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowPicker(false)}
        >
          <View style={styles.timeContainer} onStartShouldSetResponder={() => true}>
            <Text style={styles.timeTitle}>Seleziona Ora</Text>
            
            <View style={styles.timePickerRow}>
              <View style={styles.timeColumn}>
                <Text style={styles.timeColumnLabel}>Ore</Text>
                <ScrollView style={styles.timeScrollView} showsVerticalScrollIndicator={false}>
                  {hours.map((hour) => (
                    <TouchableOpacity
                      key={hour}
                      style={[
                        styles.timeOption,
                        selectedHour === hour && styles.timeOptionSelected,
                      ]}
                      onPress={() => setSelectedHour(hour)}
                    >
                      <Text
                        style={[
                          styles.timeOptionText,
                          selectedHour === hour && styles.timeOptionTextSelected,
                        ]}
                      >
                        {hour.toString().padStart(2, '0')}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
              
              <Text style={styles.timeSeparator}>:</Text>
              
              <View style={styles.timeColumn}>
                <Text style={styles.timeColumnLabel}>Minuti</Text>
                <ScrollView style={styles.timeScrollView} showsVerticalScrollIndicator={false}>
                  {minutes.map((minute) => (
                    <TouchableOpacity
                      key={minute}
                      style={[
                        styles.timeOption,
                        selectedMinute === minute && styles.timeOptionSelected,
                      ]}
                      onPress={() => setSelectedMinute(minute)}
                    >
                      <Text
                        style={[
                          styles.timeOptionText,
                          selectedMinute === minute && styles.timeOptionTextSelected,
                        ]}
                      >
                        {minute.toString().padStart(2, '0')}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>

            <View style={styles.timePreview}>
              <Text style={styles.timePreviewText}>
                {selectedHour.toString().padStart(2, '0')}:{selectedMinute.toString().padStart(2, '0')}
              </Text>
            </View>

            <View style={styles.timeButtons}>
              <TouchableOpacity
                style={styles.timeCancelButton}
                onPress={() => setShowPicker(false)}
              >
                <Text style={styles.timeCancelText}>Annulla</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.timeConfirmButton}
                onPress={handleConfirm}
              >
                <Text style={styles.timeConfirmText}>Conferma</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.cardDark,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    minHeight: 48,
  },
  icon: {
    marginRight: 10,
  },
  inputText: {
    flex: 1,
    fontSize: 16,
    color: COLORS.text,
    paddingVertical: 12,
  },
  placeholder: {
    color: COLORS.textLight,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  calendarContainer: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 20,
    width: '90%',
    maxWidth: 360,
  },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  navButton: {
    padding: 8,
  },
  monthYearText: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    textTransform: 'capitalize',
  },
  weekDaysRow: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  weekDayText: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: '14.28%',
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
  },
  dayCellSelected: {
    backgroundColor: COLORS.primary,
  },
  dayCellToday: {
    borderWidth: 2,
    borderColor: COLORS.primary,
  },
  dayText: {
    fontSize: 14,
    color: COLORS.text,
  },
  dayTextSelected: {
    color: COLORS.textWhite,
    fontWeight: '600',
  },
  dayTextToday: {
    color: COLORS.primary,
    fontWeight: '600',
  },
  closeButton: {
    marginTop: 20,
    paddingVertical: 12,
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    alignItems: 'center',
  },
  closeButtonText: {
    color: COLORS.textWhite,
    fontSize: 16,
    fontWeight: '600',
  },
  // Time picker styles
  timeContainer: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 20,
    width: '80%',
    maxWidth: 320,
  },
  timeTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 20,
  },
  timePickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeColumn: {
    alignItems: 'center',
  },
  timeColumnLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 8,
  },
  timeScrollView: {
    height: 150,
    width: 70,
  },
  timeSeparator: {
    fontSize: 32,
    fontWeight: '700',
    color: COLORS.text,
    marginHorizontal: 16,
  },
  timeOption: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginVertical: 2,
    alignItems: 'center',
  },
  timeOptionSelected: {
    backgroundColor: COLORS.primary,
  },
  timeOptionText: {
    fontSize: 18,
    color: COLORS.text,
  },
  timeOptionTextSelected: {
    color: COLORS.textWhite,
    fontWeight: '600',
  },
  timePreview: {
    marginTop: 20,
    paddingVertical: 16,
    backgroundColor: COLORS.cardDark,
    borderRadius: 12,
    alignItems: 'center',
  },
  timePreviewText: {
    fontSize: 36,
    fontWeight: '700',
    color: COLORS.primary,
  },
  timeButtons: {
    flexDirection: 'row',
    marginTop: 20,
    gap: 12,
  },
  timeCancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  timeCancelText: {
    fontSize: 16,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  timeConfirmButton: {
    flex: 1,
    paddingVertical: 12,
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    alignItems: 'center',
  },
  timeConfirmText: {
    color: COLORS.textWhite,
    fontSize: 16,
    fontWeight: '600',
  },
});

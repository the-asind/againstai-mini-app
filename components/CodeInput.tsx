import React, { useRef, useState } from 'react';

interface CodeInputProps {
  length?: number;
  onComplete: (code: string) => void;
  hasError?: boolean;
  disabled?: boolean;
}

export const CodeInput: React.FC<CodeInputProps> = ({ length = 6, onComplete, hasError, disabled }) => {
  const [values, setValues] = useState<string[]>(Array(length).fill(''));
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  const handleChange = (index: number, val: string) => {
    if (disabled) return;
    const rawVal = val.slice(-1); // Take last char if multiple
    
    // Handle paste logic if string length > 1
    if (val.length > 1) {
        const pasted = val.slice(0, length).toUpperCase().split('');
        const newValues = [...values];
        pasted.forEach((c, i) => { if (i < length) newValues[i] = c; });
        setValues(newValues);
        if (newValues.filter(Boolean).length === length) {
             onComplete(newValues.join(''));
             inputsRef.current[length-1]?.blur();
        } else {
             const nextEmpty = newValues.findIndex(v => !v);
             if (nextEmpty !== -1) inputsRef.current[nextEmpty]?.focus();
        }
        return;
    }

    if (!/^[A-Z0-9]*$/i.test(rawVal)) return;

    const newValues = [...values];
    newValues[index] = rawVal.toUpperCase();
    setValues(newValues);

    // Move focus next
    if (rawVal && index < length - 1) {
      inputsRef.current[index + 1]?.focus();
    }
    
    // Check completion
    if (newValues.every(v => v !== '') && rawVal !== '') {
        const code = newValues.join('');
        onComplete(code);
        inputsRef.current[index]?.blur();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === 'Backspace') {
      if (!values[index] && index > 0) {
        // Move back and delete
        const newValues = [...values];
        newValues[index - 1] = '';
        setValues(newValues);
        inputsRef.current[index - 1]?.focus();
      } else {
        // Just delete current
        const newValues = [...values];
        newValues[index] = '';
        setValues(newValues);
      }
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
      e.preventDefault();
      const pastedData = e.clipboardData.getData('text').slice(0, length).toUpperCase();
      if (!/^[A-Z0-9]*$/.test(pastedData)) return;

      const newValues = [...values];
      pastedData.split('').forEach((char, i) => {
          newValues[i] = char;
      });
      setValues(newValues);
      
      if (pastedData.length === length) {
          onComplete(pastedData);
          inputsRef.current[length-1]?.blur();
      } else {
          inputsRef.current[pastedData.length]?.focus();
      }
  };

  return (
    <div className="flex gap-2 justify-between max-w-[320px] mx-auto">
      {values.map((v, i) => (
        <input
          key={i}
          ref={(el) => { inputsRef.current[i] = el; }}
          className={`w-10 h-12 text-center text-xl font-bold bg-tg-secondaryBg border rounded-lg focus:outline-none focus:border-tg-button transition-colors uppercase caret-transparent
            ${hasError ? 'border-red-500 text-red-500' : 'border-tg-hint/20 text-tg-text'}`}
          value={v}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          disabled={disabled}
          type="text"
          inputMode="text"
          autoComplete="off"
        />
      ))}
    </div>
  );
};
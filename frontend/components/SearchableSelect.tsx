'use client';

import { useState, useRef, useEffect } from 'react';
import styles from './SearchableSelect.module.css';

interface SearchableSelectProps {
  id: string;
  name: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  options: string[];
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  label?: string;
  requiredMark?: boolean;
}

export default function SearchableSelect({
  id,
  name,
  value,
  onChange,
  options,
  placeholder = 'Search…',
  disabled = false,
  required = false,
  label,
  requiredMark = false,
}: SearchableSelectProps) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const filtered = options.filter((o) =>
    o.toLowerCase().includes(query.toLowerCase())
  );

  // Sync query with selected value when dropdown closes
  useEffect(() => {
    if (!isOpen) setQuery('');
  }, [isOpen]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlighted >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll('li');
      items[highlighted]?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlighted]);

  const handleInputFocus = () => {
    if (!disabled) setIsOpen(true);
  };

  const handleInputClick = () => {
    if (!disabled) setIsOpen(true);
  };

  const selectOption = (option: string) => {
    const syntheticEvent = {
      target: { name, value: option },
    } as React.ChangeEvent<HTMLSelectElement>;
    onChange(syntheticEvent);
    setIsOpen(false);
    setQuery('');
    setHighlighted(-1);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
          setHighlighted(0);
        } else {
          setHighlighted((h) => Math.min(h + 1, filtered.length - 1));
        }
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlighted((h) => Math.max(h - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (isOpen && highlighted >= 0 && filtered[highlighted]) {
          selectOption(filtered[highlighted]);
        } else {
          setIsOpen(true);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        setHighlighted(-1);
        break;
      case 'Tab':
        setIsOpen(false);
        setHighlighted(-1);
        break;
    }
  };

  const handleWrapperClick = (e: React.MouseEvent) => {
    // Clicking the wrapper (but not children) focuses input
    if (e.target === wrapperRef.current) {
      inputRef.current?.focus();
    }
  };

  return (
    <div className={styles.wrapper} ref={wrapperRef} onClick={handleWrapperClick}>
      {/* Hidden native select for form submission */}
      <select
        id={id}
        name={name}
        value={value}
        onChange={onChange}
        required={required}
        disabled={disabled}
        tabIndex={-1}
        className={styles.hiddenSelect}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>

      {/* Search input */}
      <div className={`${styles.searchBox} ${isOpen ? styles.open : ''} ${disabled ? styles.disabled : ''}`}>
        <input
          ref={inputRef}
          type="text"
          value={isOpen ? query : value}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
            setHighlighted(-1);
          }}
          onFocus={handleInputFocus}
          onClick={handleInputClick}
          onKeyDown={handleKeyDown}
          placeholder={value || placeholder}
          className={styles.searchInput}
          autoComplete="off"
          aria-autocomplete="list"
          aria-controls={`${id}-listbox`}
          aria-expanded={isOpen}
          aria-activedescendant={highlighted >= 0 ? `${id}-option-${highlighted}` : undefined}
          disabled={disabled}
        />
      </div>

      {/* Dropdown list */}
      {isOpen && !disabled && (
        <ul
          ref={listRef}
          id={`${id}-listbox`}
          role="listbox"
          className={styles.dropdown}
          aria-label="Options"
        >
          {filtered.length === 0 ? (
            <li className={styles.noResults}>No results found</li>
          ) : (
            filtered.map((option, i) => (
              <li
                key={option}
                id={`${id}-option-${i}`}
                role="option"
                aria-selected={option === value}
                className={`${styles.option} ${option === value ? styles.selected : ''} ${i === highlighted ? styles.highlighted : ''}`}
                onMouseDown={(e) => e.preventDefault()} // prevent blur before click
                onClick={() => selectOption(option)}
                onMouseEnter={() => setHighlighted(i)}
              >
                <span className={styles.optionHighlight}>
                  {query
                    ? highlightMatch(option, query)
                    : option}
                </span>
                {option === value && (
                  <svg className={styles.checkIcon} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                )}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

function highlightMatch(text: string, query: string): React.ReactNode {
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className={styles.highlight}>{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}
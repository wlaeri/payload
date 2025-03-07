import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import isHotkey from 'is-hotkey';
import { createEditor, Transforms, Node, Element as SlateElement, Text, BaseEditor } from 'slate';
import { ReactEditor, Editable, withReact, Slate } from 'slate-react';
import { HistoryEditor, withHistory } from 'slate-history';
import { richText } from '../../../../../fields/validations';
import useField from '../../useField';
import withCondition from '../../withCondition';
import Label from '../../Label';
import Error from '../../Error';
import leafTypes from './leaves';
import elementTypes from './elements';
import toggleLeaf from './leaves/toggle';
import hotkeys from './hotkeys';
import enablePlugins from './enablePlugins';
import defaultValue from '../../../../../fields/richText/defaultValue';
import FieldDescription from '../../FieldDescription';
import withHTML from './plugins/withHTML';
import { Props } from './types';
import { RichTextElement, RichTextLeaf } from '../../../../../fields/config/types';
import listTypes from './elements/listTypes';
import mergeCustomFunctions from './mergeCustomFunctions';
import withEnterBreakOut from './plugins/withEnterBreakOut';

import './index.scss';

const defaultElements: RichTextElement[] = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'indent', 'link', 'relationship', 'upload'];
const defaultLeaves: RichTextLeaf[] = ['bold', 'italic', 'underline', 'strikethrough', 'code'];

const baseClass = 'rich-text';
type CustomText = { text: string;[x: string]: unknown }

type CustomElement = { type?: string; children: CustomText[] }

declare module 'slate' {
  interface CustomTypes {
    Editor: BaseEditor & ReactEditor & HistoryEditor
    Element: CustomElement
    Text: CustomText
  }
}

const RichText: React.FC<Props> = (props) => {
  const {
    path: pathFromProps,
    name,
    required,
    validate = richText,
    label,
    admin,
    admin: {
      readOnly,
      style,
      className,
      width,
      placeholder,
      description,
      condition,
      hideGutter,
    } = {},
  } = props;

  const elements: RichTextElement[] = admin?.elements || defaultElements;
  const leaves: RichTextLeaf[] = admin?.leaves || defaultLeaves;

  const path = pathFromProps || name;

  const [loaded, setLoaded] = useState(false);
  const [enabledElements, setEnabledElements] = useState({});
  const [enabledLeaves, setEnabledLeaves] = useState({});
  const [initialValueKey, setInitialValueKey] = useState('');
  const editorRef = useRef(null);
  const toolbarRef = useRef(null);

  const renderElement = useCallback(({ attributes, children, element }) => {
    const matchedElement = enabledElements[element?.type];
    const Element = matchedElement?.Element;

    if (Element) {
      return (
        <Element
          attributes={attributes}
          element={element}
          path={path}
          fieldProps={props}
          editorRef={editorRef}
        >
          {children}
        </Element>
      );
    }

    return <div {...attributes}>{children}</div>;
  }, [enabledElements, path, props]);

  const renderLeaf = useCallback(({ attributes, children, leaf }) => {
    const matchedLeafName = Object.keys(enabledLeaves).find((leafName) => leaf[leafName]);

    if (enabledLeaves[matchedLeafName]?.Leaf) {
      const { Leaf } = enabledLeaves[matchedLeafName];

      return (
        <Leaf
          attributes={attributes}
          leaf={leaf}
          path={path}
          fieldProps={props}
          editorRef={editorRef}
        >
          {children}
        </Leaf>
      );
    }

    return (
      <span {...attributes}>{children}</span>
    );
  }, [enabledLeaves, path, props]);

  const memoizedValidate = useCallback((value, validationOptions) => {
    return validate(value, { ...validationOptions, required });
  }, [validate, required]);

  const fieldType = useField({
    path,
    validate: memoizedValidate,
    condition,
  });

  const {
    value,
    showError,
    setValue,
    errorMessage,
    initialValue,
  } = fieldType;

  const classes = [
    baseClass,
    'field-type',
    className,
    showError && 'error',
    readOnly && `${baseClass}--read-only`,
    !hideGutter && `${baseClass}--gutter`,
  ].filter(Boolean).join(' ');

  const editor = useMemo(() => {
    let CreatedEditor = withEnterBreakOut(
      withHistory(
        withReact(
          createEditor(),
        ),
      ),
    );

    CreatedEditor = withHTML(CreatedEditor);

    CreatedEditor = enablePlugins(CreatedEditor, elements);
    CreatedEditor = enablePlugins(CreatedEditor, leaves);

    return CreatedEditor;
  }, [elements, leaves]);

  useEffect(() => {
    if (!loaded) {
      const mergedElements = mergeCustomFunctions(elements, elementTypes);
      const mergedLeaves = mergeCustomFunctions(leaves, leafTypes);

      setEnabledElements(mergedElements);
      setEnabledLeaves(mergedLeaves);

      setLoaded(true);
    }
  }, [loaded, elements, leaves]);

  useEffect(() => {
    setInitialValueKey(JSON.stringify(initialValue || ''));
  }, [initialValue]);

  useEffect(() => {
    function setClickableState(clickState: 'disabled' | 'enabled') {
      const selectors = 'button, a, [role="button"]';
      const toolbarButtons: (HTMLButtonElement | HTMLAnchorElement)[] = toolbarRef.current.querySelectorAll(selectors);
      const editorButtons: (HTMLButtonElement | HTMLAnchorElement)[] = editorRef.current.querySelectorAll(selectors);

      [...(toolbarButtons || []), ...(editorButtons || [])].forEach((child) => {
        const isButton = child.tagName === 'BUTTON';
        const isDisabling = clickState === 'disabled';
        child.setAttribute('tabIndex', isDisabling ? '-1' : '0');
        if (isButton) child.setAttribute('disabled', isDisabling ? 'disabled' : null);
      });
    }

    if (loaded && readOnly) {
      setClickableState('disabled');
    }

    return () => {
      if (loaded && readOnly) {
        setClickableState('enabled');
      }
    };
  }, [loaded, readOnly]);

  if (!loaded) {
    return null;
  }

  let valueToRender = value;
  if (typeof valueToRender === 'string') {
    try {
      const parsedJSON = JSON.parse(valueToRender);
      valueToRender = parsedJSON;
    } catch (err) {
      // do nothing
    }
  }

  if (!valueToRender) valueToRender = defaultValue;

  return (
    <div
      key={initialValueKey}
      className={classes}
      style={{
        ...style,
        width,
      }}
    >
      <div className={`${baseClass}__wrap`}>
        <Error
          showError={showError}
          message={errorMessage}
        />
        <Label
          htmlFor={`field-${path.replace(/\./gi, '__')}`}
          label={label}
          required={required}
        />
        <Slate
          editor={editor}
          value={valueToRender as any[]}
          onChange={(val) => {
            if (!readOnly && val !== defaultValue && val !== value) {
              setValue(val);
            }
          }}
        >
          <div className={`${baseClass}__wrapper`}>
            <div
              className={`${baseClass}__toolbar`}
              ref={toolbarRef}
            >
              <div className={`${baseClass}__toolbar-wrap`}>
                {elements.map((element, i) => {
                  let elementName: string;
                  if (typeof element === 'object' && element?.name) elementName = element.name;
                  if (typeof element === 'string') elementName = element;

                  const elementType = enabledElements[elementName];
                  const Button = elementType?.Button;

                  if (Button) {
                    return (
                      <Button
                        fieldProps={props}
                        key={i}
                        path={path}
                      />
                    );
                  }

                  return null;
                })}
                {leaves.map((leaf, i) => {
                  let leafName: string;
                  if (typeof leaf === 'object' && leaf?.name) leafName = leaf.name;
                  if (typeof leaf === 'string') leafName = leaf;

                  const leafType = enabledLeaves[leafName];
                  const Button = leafType?.Button;

                  if (Button) {
                    return (
                      <Button
                        fieldProps={props}
                        key={i}
                        path={path}
                      />
                    );
                  }

                  return null;
                })}
              </div>
            </div>
            <div
              className={`${baseClass}__editor`}
              ref={editorRef}
            >
              <Editable
                id={`field-${path.replace(/\./gi, '__')}`}
                className={`${baseClass}__input`}
                renderElement={renderElement}
                renderLeaf={renderLeaf}
                placeholder={placeholder}
                spellCheck
                readOnly={readOnly}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    if (event.shiftKey) {
                      event.preventDefault();
                      editor.insertText('\n');
                    } else {
                      const selectedElement = Node.descendant(editor, editor.selection.anchor.path.slice(0, -1));

                      if (SlateElement.isElement(selectedElement)) {
                        // Allow hard enter to "break out" of certain elements
                        if (editor.shouldBreakOutOnEnter(selectedElement)) {
                          event.preventDefault();
                          const selectedLeaf = Node.descendant(editor, editor.selection.anchor.path);

                          if (Text.isText(selectedLeaf) && String(selectedLeaf.text).length === editor.selection.anchor.offset) {
                            Transforms.insertNodes(editor, { children: [{ text: '' }] });
                          } else {
                            Transforms.splitNodes(editor);
                            Transforms.setNodes(editor, {});
                          }
                        }
                      }
                    }
                  }

                  if (event.key === 'Backspace') {
                    const selectedElement = Node.descendant(editor, editor.selection.anchor.path.slice(0, -1));

                    if (SlateElement.isElement(selectedElement) && selectedElement.type === 'li') {
                      const selectedLeaf = Node.descendant(editor, editor.selection.anchor.path);
                      if (Text.isText(selectedLeaf) && String(selectedLeaf.text).length === 1) {
                        Transforms.unwrapNodes(editor, {
                          match: (n) => SlateElement.isElement(n) && listTypes.includes(n.type),
                          split: true,
                        });

                        Transforms.setNodes(editor, {});
                      }
                    } else if (editor.isVoid(selectedElement)) {
                      Transforms.removeNodes(editor);
                    }
                  }

                  Object.keys(hotkeys).forEach((hotkey) => {
                    if (isHotkey(hotkey, event as any)) {
                      event.preventDefault();
                      const mark = hotkeys[hotkey];
                      toggleLeaf(editor, mark);
                    }
                  });
                }}
              />
            </div>
          </div>
        </Slate>
        <FieldDescription
          value={value}
          description={description}
        />
      </div>
    </div>
  );
};
export default withCondition(RichText);

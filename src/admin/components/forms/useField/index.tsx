import { useCallback, useMemo } from 'react';
import { useAuth } from '../../utilities/Auth';
import { useFormProcessing, useFormSubmitted, useFormModified, useForm, useFormFields } from '../Form/context';
import { Options, FieldType } from './types';
import { useDocumentInfo } from '../../utilities/DocumentInfo';
import { useOperation } from '../../utilities/OperationProvider';
import useThrottledEffect from '../../../hooks/useThrottledEffect';
import { UPDATE } from '../Form/types';

const useField = <T extends unknown>(options: Options): FieldType<T> => {
  const {
    path,
    validate,
    disableFormData = false,
    condition,
  } = options;

  const submitted = useFormSubmitted();
  const processing = useFormProcessing();
  const modified = useFormModified();
  const { user } = useAuth();
  const { id } = useDocumentInfo();
  const operation = useOperation();
  const field = useFormFields(([fields]) => fields[path]);
  const dispatchField = useFormFields(([_, dispatch]) => dispatch);

  const { getData, getSiblingData, setModified } = useForm();

  const value = field?.value as T;
  const initialValue = field?.initialValue as T;
  const valid = typeof field?.valid === 'boolean' ? field.valid : true;
  const showError = valid === false && submitted;

  // Method to return from `useField`, used to
  // update field values from field component(s)
  const setValue = useCallback((e, disableModifyingForm = false) => {
    const val = (e && e.target) ? e.target.value : e;

    if (!modified && !disableModifyingForm) {
      if (typeof setModified === 'function') {
        setModified(true);
      }
    }

    dispatchField({
      type: 'UPDATE',
      path,
      value: val,
      disableFormData,
    });
  }, [
    setModified,
    modified,
    path,
    dispatchField,
    disableFormData,
  ]);

  // Store result from hook as ref
  // to prevent unnecessary rerenders
  const result = useMemo(() => ({
    showError,
    errorMessage: field?.errorMessage,
    value,
    formSubmitted: submitted,
    formProcessing: processing,
    setValue,
    initialValue,
  }), [field, processing, setValue, showError, submitted, value, initialValue]);

  // Throttle the validate function
  useThrottledEffect(() => {
    const validateField = async () => {
      const action: UPDATE = {
        type: 'UPDATE',
        path,
        disableFormData,
        validate,
        condition,
        value,
        valid: false,
        errorMessage: undefined,
      };

      const validateOptions = {
        id,
        user,
        data: getData(),
        siblingData: getSiblingData(path),
        operation,
      };

      const validationResult = typeof validate === 'function' ? await validate(value, validateOptions) : true;

      if (typeof validationResult === 'string') {
        action.errorMessage = validationResult;
        action.valid = false;
      } else {
        action.valid = validationResult;
        action.errorMessage = undefined;
      }

      if (action.valid !== valid && typeof dispatchField === 'function') {
        dispatchField(action);
      }
    };

    validateField();
  }, 150, [
    value,
    condition,
    disableFormData,
    dispatchField,
    getData,
    getSiblingData,
    id,
    operation,
    path,
    user,
    validate,
    valid,
  ]);

  return result;
};

export default useField;

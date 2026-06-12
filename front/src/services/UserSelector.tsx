import { useState, useEffect } from 'react';
import type {  FieldErrors, UseFormGetValues, UseFormSetValue, Path, Control } from 'react-hook-form';
import  { Controller  } from 'react-hook-form';

import { useQuery } from '@tanstack/react-query';
import { Autocomplete, TextField, CircularProgress } from '@mui/material';
import { apiInstance } from './api';

export interface UserOption {
    id: number;
    firstName: string;
    lastName: string;
}

type FormFields = {
    id: number;
    user_id: number | null | undefined;
    firstName?: string;
    lastName?: string;
    [key: string]: any;
};

interface UserSelectorProps<T extends FormFields> {
    control: Control<T, any>;
    errors: FieldErrors<T>;
    getValues: UseFormGetValues<T>;
    setValue: UseFormSetValue<T>;
    isReadOnly?: boolean;
}

export const UserSelector = <T extends FormFields>({
    control,
    errors,
    getValues,
    setValue,
    isReadOnly = false
}: UserSelectorProps<T>) => {
    const [inputValue, setInputValue] = useState('');
    const [debouncedInputValue, setDebouncedInputValue] = useState('');
    const [selectedUser, setSelectedUser] = useState<UserOption | null>(() => {
        const id = getValues('user_id' as Path<T>);
        const firstName = getValues('firstName' as Path<T>);
        const lastName = getValues('lastName' as Path<T>);
        if (id && firstName && lastName) {
            return { id: id as number, firstName, lastName };
        }
        return null;
    });

    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedInputValue(inputValue);
        }, 500);
        return () => clearTimeout(handler);
    }, [inputValue]);

    const { data: users, isLoading } = useQuery({
        queryKey: ['users', debouncedInputValue],
        queryFn: async () => {
            if (!debouncedInputValue) return [];
            const params = new URLSearchParams({ q: debouncedInputValue });
            const res = await apiInstance.get<UserOption[]>(`/api/v0/user/search?${params.toString()}`);
            return res.data;
        },
        enabled: !isReadOnly,
    });

    if (isReadOnly) {
        return (
            <TextField label="Élève" value={`${getValues("lastName" as Path<T>) || ''} ${getValues("firstName" as Path<T>) || ''}`} variant="outlined" fullWidth disabled sx={{ mb: 2 }} />
        );
    }

    return (
        <Controller
            name={'user_id' as Path<T>}
            control={control}
            render={({ field }) => (
                <Autocomplete
                    options={users || []}
                    loading={isLoading}
                    filterOptions={(x) => x} // Server-side filtering
                    getOptionLabel={(option) => `${option.lastName} ${option.firstName}`}
                    value={selectedUser}
                    inputValue={inputValue}
                    onInputChange={(_, newInputValue) => setInputValue(newInputValue)}
                    onChange={(_, newValue) => {
                        field.onChange(newValue?.id ?? null);
                        setValue('firstName' as Path<T>, (newValue?.firstName ?? '') as any);
                        setValue('lastName' as Path<T>, (newValue?.lastName ?? '') as any);
                        setSelectedUser(newValue);
                    }}
                    renderInput={(params) => (
                        <TextField
                            {...params}
                            label="Rechercher un élève"
                            error={!!errors.user_id}
                            helperText={errors.user_id?.message as string}
                            InputProps={{ ...params.InputProps, endAdornment: (<>{isLoading ? <CircularProgress color="inherit" size={20} /> : null}{params.InputProps.endAdornment}</>) }}
                        />
                    )}
                    sx={{ mb: 2 }}
                />
            )}
        />
    );
};
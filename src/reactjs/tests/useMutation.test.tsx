import { fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import React from 'react'
import { ErrorBoundary } from 'react-error-boundary'

import { useMutation, QueryCache, MutationCache } from '../..'
import { UseMutationResult } from '../types'
import {
  createQueryClient,
  mockNavigatorOnLine,
  queryKey,
  renderWithClient,
  setActTimeout,
  sleep,
} from './utils'

describe('useMutation', () => {
  const queryCache = new QueryCache()
  const mutationCache = new MutationCache()
  const queryClient = createQueryClient({ queryCache, mutationCache })

  it('should be able to reset `data`', async () => {
    function Page() {
      const { mutate, data = '', reset } = useMutation(() =>
        Promise.resolve('mutation')
      )

      return (
        <div>
          <h1 data-testid="title">{data}</h1>
          <button onClick={() => reset()}>reset</button>
          <button onClick={() => mutate()}>mutate</button>
        </div>
      )
    }

    const { getByTestId, getByText } = renderWithClient(queryClient, <Page />)

    expect(getByTestId('title').textContent).toBe('')

    fireEvent.click(getByText('mutate'))

    await waitFor(() => getByTestId('title'))

    expect(getByTestId('title').textContent).toBe('mutation')

    fireEvent.click(getByText('reset'))

    await waitFor(() => getByTestId('title'))

    expect(getByTestId('title').textContent).toBe('')
  })

  it('should be able to reset `error`', async () => {
    function Page() {
      const { mutate, error, reset } = useMutation<string, Error>(() => {
        const err = new Error('Expected mock error. All is well!')
        err.stack = ''
        return Promise.reject(err)
      })

      return (
        <div>
          {error && <h1 data-testid="error">{error.message}</h1>}
          <button onClick={() => reset()}>reset</button>
          <button onClick={() => mutate()}>mutate</button>
        </div>
      )
    }

    const { getByTestId, getByText, queryByTestId } = renderWithClient(
      queryClient,
      <Page />
    )

    expect(queryByTestId('error')).toBeNull()

    fireEvent.click(getByText('mutate'))

    await waitFor(() => getByTestId('error'))

    expect(getByTestId('error').textContent).toBe(
      'Expected mock error. All is well!'
    )

    fireEvent.click(getByText('reset'))

    await waitFor(() => expect(queryByTestId('error')).toBeNull())
  })

  it('should be able to call `onSuccess` and `onSettled` after each successful mutate', async () => {
    let count = 0
    const onSuccessMock = jest.fn()
    const onSettledMock = jest.fn()

    function Page() {
      const { mutate } = useMutation(
        async (vars: { count: number }) => Promise.resolve(vars.count),
        {
          onSuccess: data => {
            onSuccessMock(data)
          },
          onSettled: data => {
            onSettledMock(data)
          },
        }
      )

      return (
        <div>
          <h1 data-testid="title">{count}</h1>
          <button onClick={() => mutate({ count: ++count })}>mutate</button>
        </div>
      )
    }

    const { getByTestId, getByText } = renderWithClient(queryClient, <Page />)

    expect(getByTestId('title').textContent).toBe('0')

    fireEvent.click(getByText('mutate'))
    fireEvent.click(getByText('mutate'))
    fireEvent.click(getByText('mutate'))

    await waitFor(() => getByTestId('title'))

    expect(onSuccessMock).toHaveBeenCalledTimes(3)
    expect(onSuccessMock).toHaveBeenCalledWith(1)
    expect(onSuccessMock).toHaveBeenCalledWith(2)
    expect(onSuccessMock).toHaveBeenCalledWith(3)

    expect(onSettledMock).toHaveBeenCalledTimes(3)
    expect(onSettledMock).toHaveBeenCalledWith(1)
    expect(onSettledMock).toHaveBeenCalledWith(2)
    expect(onSettledMock).toHaveBeenCalledWith(3)

    expect(getByTestId('title').textContent).toBe('3')
  })

  it('should be able to call `onError` and `onSettled` after each failed mutate', async () => {
    const onErrorMock = jest.fn()
    const onSettledMock = jest.fn()
    let count = 0

    function Page() {
      const { mutate } = useMutation(
        (vars: { count: number }) => {
          const error = new Error(
            `Expected mock error. All is well! ${vars.count}`
          )
          error.stack = ''
          return Promise.reject(error)
        },
        {
          onError: (error: Error) => {
            onErrorMock(error.message)
          },
          onSettled: (_data, error) => {
            onSettledMock(error?.message)
          },
        }
      )

      return (
        <div>
          <h1 data-testid="title">{count}</h1>
          <button onClick={() => mutate({ count: ++count })}>mutate</button>
        </div>
      )
    }

    const { getByTestId, getByText } = renderWithClient(queryClient, <Page />)

    expect(getByTestId('title').textContent).toBe('0')

    fireEvent.click(getByText('mutate'))
    fireEvent.click(getByText('mutate'))
    fireEvent.click(getByText('mutate'))

    await waitFor(() => getByTestId('title'))

    expect(onErrorMock).toHaveBeenCalledTimes(3)
    expect(onErrorMock).toHaveBeenCalledWith(
      'Expected mock error. All is well! 1'
    )
    expect(onErrorMock).toHaveBeenCalledWith(
      'Expected mock error. All is well! 2'
    )
    expect(onErrorMock).toHaveBeenCalledWith(
      'Expected mock error. All is well! 3'
    )

    expect(onSettledMock).toHaveBeenCalledTimes(3)
    expect(onSettledMock).toHaveBeenCalledWith(
      'Expected mock error. All is well! 1'
    )
    expect(onSettledMock).toHaveBeenCalledWith(
      'Expected mock error. All is well! 2'
    )
    expect(onSettledMock).toHaveBeenCalledWith(
      'Expected mock error. All is well! 3'
    )

    expect(getByTestId('title').textContent).toBe('3')
  })

  it('should be able to override the useMutation success callbacks', async () => {
    const callbacks: string[] = []

    function Page() {
      const { mutateAsync } = useMutation(async (text: string) => text, {
        onSuccess: async () => {
          callbacks.push('useMutation.onSuccess')
        },
        onSettled: async () => {
          callbacks.push('useMutation.onSettled')
        },
      })

      React.useEffect(() => {
        setActTimeout(async () => {
          try {
            const result = await mutateAsync('todo', {
              onSuccess: async () => {
                callbacks.push('mutateAsync.onSuccess')
              },
              onSettled: async () => {
                callbacks.push('mutateAsync.onSettled')
              },
            })
            callbacks.push(`mutateAsync.result:${result}`)
          } catch {}
        }, 10)
      }, [mutateAsync])

      return null
    }

    renderWithClient(queryClient, <Page />)

    await sleep(100)

    expect(callbacks).toEqual([
      'useMutation.onSuccess',
      'useMutation.onSettled',
      'mutateAsync.onSuccess',
      'mutateAsync.onSettled',
      'mutateAsync.result:todo',
    ])
  })

  it('should be able to override the error callbacks when using mutateAsync', async () => {
    const callbacks: string[] = []

    function Page() {
      const { mutateAsync } = useMutation(
        async (_text: string) => Promise.reject('oops'),
        {
          onError: async () => {
            callbacks.push('useMutation.onError')
          },
          onSettled: async () => {
            callbacks.push('useMutation.onSettled')
          },
        }
      )

      React.useEffect(() => {
        setActTimeout(async () => {
          try {
            await mutateAsync('todo', {
              onError: async () => {
                callbacks.push('mutateAsync.onError')
              },
              onSettled: async () => {
                callbacks.push('mutateAsync.onSettled')
              },
            })
          } catch (error) {
            callbacks.push(`mutateAsync.error:${error}`)
          }
        }, 10)
      }, [mutateAsync])

      return null
    }

    renderWithClient(queryClient, <Page />)

    await sleep(100)

    expect(callbacks).toEqual([
      'useMutation.onError',
      'useMutation.onSettled',
      'mutateAsync.onError',
      'mutateAsync.onSettled',
      'mutateAsync.error:oops',
    ])
  })

  it('should be able to use mutation defaults', async () => {
    const key = queryKey()

    queryClient.setMutationDefaults(key, {
      mutationFn: async (text: string) => text,
    })

    const states: UseMutationResult<any, any, any, any>[] = []

    function Page() {
      const state = useMutation<string, unknown, string>(key)

      states.push(state)

      const { mutate } = state

      React.useEffect(() => {
        setActTimeout(() => {
          mutate('todo')
        }, 10)
      }, [mutate])

      return null
    }

    renderWithClient(queryClient, <Page />)

    await sleep(100)

    expect(states.length).toBe(3)
    expect(states[0]).toMatchObject({ data: undefined, isLoading: false })
    expect(states[1]).toMatchObject({ data: undefined, isLoading: true })
    expect(states[2]).toMatchObject({ data: 'todo', isLoading: false })
  })

  it('should be able to retry a failed mutation', async () => {
    let count = 0

    function Page() {
      const { mutate } = useMutation(
        (_text: string) => {
          count++
          return Promise.reject('oops')
        },
        {
          retry: 1,
          retryDelay: 5,
        }
      )

      React.useEffect(() => {
        setActTimeout(() => {
          mutate('todo')
        }, 10)
      }, [mutate])

      return null
    }

    renderWithClient(queryClient, <Page />)

    await sleep(100)

    expect(count).toBe(2)
  })

  it('should not retry mutations while offline', async () => {
    const onlineMock = mockNavigatorOnLine(false)

    let count = 0

    function Page() {
      const mutation = useMutation(
        (_text: string) => {
          count++
          return Promise.reject(new Error('oops'))
        },
        {
          retry: 1,
          retryDelay: 5,
        }
      )

      return (
        <div>
          <button onClick={() => mutation.mutate('todo')}>mutate</button>
          <div>
            error:{' '}
            {mutation.error instanceof Error ? mutation.error.message : 'null'},
            status: {mutation.status}, isPaused: {String(mutation.isPaused)}
          </div>
        </div>
      )
    }

    const rendered = renderWithClient(queryClient, <Page />)

    await waitFor(() => {
      expect(
        rendered.getByText('error: null, status: idle, isPaused: false')
      ).toBeInTheDocument()
    })

    rendered.getByRole('button', { name: /mutate/i }).click()

    await waitFor(() => {
      expect(
        rendered.getByText('error: null, status: loading, isPaused: true')
      ).toBeInTheDocument()
    })

    expect(count).toBe(0)

    onlineMock.mockReturnValue(true)
    window.dispatchEvent(new Event('online'))

    await sleep(100)

    await waitFor(() => {
      expect(
        rendered.getByText('error: oops, status: error, isPaused: false')
      ).toBeInTheDocument()
    })

    expect(count).toBe(2)

    onlineMock.mockRestore()
  })

  it('should call onMutate even if paused', async () => {
    const onlineMock = mockNavigatorOnLine(false)
    const onMutate = jest.fn()
    let count = 0

    function Page() {
      const mutation = useMutation(
        async (_text: string) => {
          count++
          await sleep(10)
          return count
        },
        {
          onMutate,
        }
      )

      return (
        <div>
          <button onClick={() => mutation.mutate('todo')}>mutate</button>
          <div>
            data: {mutation.data ?? 'null'}, status: {mutation.status},
            isPaused: {String(mutation.isPaused)}
          </div>
        </div>
      )
    }

    const rendered = renderWithClient(queryClient, <Page />)

    await rendered.findByText('data: null, status: idle, isPaused: false')

    rendered.getByRole('button', { name: /mutate/i }).click()

    await rendered.findByText('data: null, status: loading, isPaused: true')

    expect(onMutate).toHaveBeenCalledTimes(1)
    expect(onMutate).toHaveBeenCalledWith('todo')

    onlineMock.mockReturnValue(true)
    window.dispatchEvent(new Event('online'))

    await rendered.findByText('data: 1, status: success, isPaused: false')

    expect(onMutate).toHaveBeenCalledTimes(1)
    expect(count).toBe(1)

    onlineMock.mockRestore()
  })

  it('should optimistically go to paused state if offline', async () => {
    const onlineMock = mockNavigatorOnLine(false)
    let count = 0
    const states: Array<string> = []

    function Page() {
      const mutation = useMutation(async (_text: string) => {
        count++
        await sleep(10)
        return count
      })

      states.push(`${mutation.status}, ${mutation.isPaused}`)

      return (
        <div>
          <button onClick={() => mutation.mutate('todo')}>mutate</button>
          <div>
            data: {mutation.data ?? 'null'}, status: {mutation.status},
            isPaused: {String(mutation.isPaused)}
          </div>
        </div>
      )
    }

    const rendered = renderWithClient(queryClient, <Page />)

    await rendered.findByText('data: null, status: idle, isPaused: false')

    rendered.getByRole('button', { name: /mutate/i }).click()

    await rendered.findByText('data: null, status: loading, isPaused: true')

    // no intermediate 'loading, false' state is expected because we don't start mutating!
    expect(states[0]).toBe('idle, false')
    expect(states[1]).toBe('loading, true')

    onlineMock.mockReturnValue(true)
    window.dispatchEvent(new Event('online'))

    await rendered.findByText('data: 1, status: success, isPaused: false')

    onlineMock.mockRestore()
  })

  it('should be able to retry a mutation when online', async () => {
    const onlineMock = mockNavigatorOnLine(false)

    let count = 0
    const states: UseMutationResult<any, any, any, any>[] = []

    function Page() {
      const state = useMutation(
        (_text: string) => {
          count++
          return count > 1 ? Promise.resolve('data') : Promise.reject('oops')
        },
        {
          retry: 1,
          retryDelay: 5,
          networkMode: 'offlineFirst',
        }
      )

      states.push(state)

      const { mutate } = state

      React.useEffect(() => {
        setActTimeout(() => {
          mutate('todo')
        }, 10)
      }, [mutate])

      return null
    }

    renderWithClient(queryClient, <Page />)

    await sleep(50)

    expect(states.length).toBe(4)
    expect(states[0]).toMatchObject({
      isLoading: false,
      isPaused: false,
      failureCount: 0,
    })
    expect(states[1]).toMatchObject({
      isLoading: true,
      isPaused: false,
      failureCount: 0,
    })
    expect(states[2]).toMatchObject({
      isLoading: true,
      isPaused: false,
      failureCount: 1,
    })
    expect(states[3]).toMatchObject({
      isLoading: true,
      isPaused: true,
      failureCount: 1,
    })

    onlineMock.mockReturnValue(true)
    window.dispatchEvent(new Event('online'))

    await sleep(50)

    expect(states.length).toBe(6)
    expect(states[4]).toMatchObject({
      isLoading: true,
      isPaused: false,
      failureCount: 1,
    })
    expect(states[5]).toMatchObject({
      isLoading: false,
      isPaused: false,
      failureCount: 1,
      data: 'data',
    })

    onlineMock.mockRestore()
  })

  it('should not change state if unmounted', async () => {
    function Mutates() {
      const { mutate } = useMutation(() => sleep(10))
      return <button onClick={() => mutate()}>mutate</button>
    }
    function Page() {
      const [mounted, setMounted] = React.useState(true)
      return (
        <div>
          <button onClick={() => setMounted(false)}>unmount</button>
          {mounted && <Mutates />}
        </div>
      )
    }

    const { getByText } = renderWithClient(queryClient, <Page />)
    fireEvent.click(getByText('mutate'))
    fireEvent.click(getByText('unmount'))
  })

  it('should be able to throw an error when useErrorBoundary is set to true', async () => {
    function Page() {
      const { mutate } = useMutation<string, Error>(
        () => {
          const err = new Error('Expected mock error. All is well!')
          err.stack = ''
          return Promise.reject(err)
        },
        { useErrorBoundary: true }
      )

      return (
        <div>
          <button onClick={() => mutate()}>mutate</button>
        </div>
      )
    }

    const { getByText, queryByText } = renderWithClient(
      queryClient,
      <ErrorBoundary
        fallbackRender={() => (
          <div>
            <span>error</span>
          </div>
        )}
      >
        <Page />
      </ErrorBoundary>
    )

    fireEvent.click(getByText('mutate'))

    await waitFor(() => {
      expect(queryByText('error')).not.toBeNull()
    })
  })

  it('should pass meta to mutation', async () => {
    const errorMock = jest.fn()
    const successMock = jest.fn()

    const queryClientMutationMeta = createQueryClient({
      mutationCache: new MutationCache({
        onSuccess: (_, __, ___, mutation) => {
          successMock(mutation.meta?.metaSuccessMessage)
        },
        onError: (_, __, ___, mutation) => {
          errorMock(mutation.meta?.metaErrorMessage)
        },
      }),
    })

    const metaSuccessMessage = 'mutation succeeded'
    const metaErrorMessage = 'mutation failed'

    function Page() {
      const { mutate: succeed, isSuccess } = useMutation(async () => '', {
        meta: { metaSuccessMessage },
      })
      const { mutate: error, isError } = useMutation(
        async () => {
          throw new Error('')
        },
        {
          meta: { metaErrorMessage },
        }
      )

      return (
        <div>
          <button onClick={() => succeed()}>succeed</button>
          <button onClick={() => error()}>error</button>
          {isSuccess && <div>successTest</div>}
          {isError && <div>errorTest</div>}
        </div>
      )
    }

    const { getByText, queryByText } = renderWithClient(
      queryClientMutationMeta,
      <Page />
    )

    fireEvent.click(getByText('succeed'))
    fireEvent.click(getByText('error'))

    await waitFor(() => {
      expect(queryByText('successTest')).not.toBeNull()
      expect(queryByText('errorTest')).not.toBeNull()
    })

    expect(successMock).toHaveBeenCalledTimes(1)
    expect(successMock).toHaveBeenCalledWith(metaSuccessMessage)
    expect(errorMock).toHaveBeenCalledTimes(1)
    expect(errorMock).toHaveBeenCalledWith(metaErrorMessage)
  })

  it('should call cache callbacks when unmounted', async () => {
    const onSuccess = jest.fn()
    const onSuccessMutate = jest.fn()
    const onSettled = jest.fn()
    const onSettledMutate = jest.fn()
    const mutationKey = queryKey()
    let count = 0

    function Page() {
      const [show, setShow] = React.useState(true)
      return (
        <div>
          <button onClick={() => setShow(false)}>hide</button>
          {show && <Component />}
        </div>
      )
    }

    function Component() {
      const mutation = useMutation(
        async (_text: string) => {
          count++
          await sleep(10)
          return count
        },
        {
          mutationKey,
          cacheTime: 0,
          onSuccess,
          onSettled,
        }
      )

      return (
        <div>
          <button
            onClick={() =>
              mutation.mutate('todo', {
                onSuccess: onSuccessMutate,
                onSettled: onSettledMutate,
              })
            }
          >
            mutate
          </button>
          <div>
            data: {mutation.data ?? 'null'}, status: {mutation.status},
            isPaused: {String(mutation.isPaused)}
          </div>
        </div>
      )
    }

    const rendered = renderWithClient(queryClient, <Page />)

    await rendered.findByText('data: null, status: idle, isPaused: false')

    rendered.getByRole('button', { name: /mutate/i }).click()
    rendered.getByRole('button', { name: /hide/i }).click()

    await waitFor(() => {
      expect(
        queryClient.getMutationCache().findAll({ mutationKey })
      ).toHaveLength(0)
    })

    expect(count).toBe(1)

    expect(onSuccess).toHaveBeenCalledTimes(1)
    expect(onSettled).toHaveBeenCalledTimes(1)
    expect(onSuccessMutate).toHaveBeenCalledTimes(0)
    expect(onSettledMutate).toHaveBeenCalledTimes(0)
  })

  it('should call mutate callbacks only for the last observer', async () => {
    const onSuccess = jest.fn()
    const onSuccessMutate = jest.fn()
    const onSettled = jest.fn()
    const onSettledMutate = jest.fn()
    let count = 0

    function Page() {
      const mutation = useMutation(
        async (_text: string) => {
          count++
          await sleep(10)
          return `result${count}`
        },
        {
          onSuccess,
          onSettled,
        }
      )

      return (
        <div>
          <button
            onClick={() =>
              mutation.mutate('todo', {
                onSuccess: onSuccessMutate,
                onSettled: onSettledMutate,
              })
            }
          >
            mutate
          </button>
          <div>
            data: {mutation.data ?? 'null'}, status: {mutation.status}
          </div>
        </div>
      )
    }

    const rendered = renderWithClient(queryClient, <Page />)

    await rendered.findByText('data: null, status: idle')

    rendered.getByRole('button', { name: /mutate/i }).click()
    rendered.getByRole('button', { name: /mutate/i }).click()

    await rendered.findByText('data: result2, status: success')

    expect(count).toBe(2)

    expect(onSuccess).toHaveBeenCalledTimes(2)
    expect(onSettled).toHaveBeenCalledTimes(2)
    expect(onSuccessMutate).toHaveBeenCalledTimes(1)
    expect(onSuccessMutate).toHaveBeenCalledWith('result2', 'todo', undefined)
    expect(onSettledMutate).toHaveBeenCalledTimes(1)
    expect(onSettledMutate).toHaveBeenCalledWith(
      'result2',
      null,
      'todo',
      undefined
    )
  })

  test('should go to error state if onSuccess callback errors', async () => {
    const error = new Error('error from onSuccess')
    const onError = jest.fn()

    function Page() {
      const mutation = useMutation(
        async (_text: string) => {
          await sleep(10)
          return 'result'
        },
        {
          onSuccess: () => Promise.reject(error),
          onError,
        }
      )

      return (
        <div>
          <button onClick={() => mutation.mutate('todo')}>mutate</button>
          <div>status: {mutation.status}</div>
        </div>
      )
    }

    const rendered = renderWithClient(queryClient, <Page />)

    await rendered.findByText('status: idle')

    rendered.getByRole('button', { name: /mutate/i }).click()

    await rendered.findByText('status: error')

    expect(onError).toHaveBeenCalledWith(error, 'todo', undefined)
  })

  test('should go to error state if onError callback errors', async () => {
    const error = new Error('error from onError')
    const mutateFnError = new Error('mutateFnError')

    function Page() {
      const mutation = useMutation(
        async (_text: string) => {
          await sleep(10)
          throw mutateFnError
        },
        {
          onError: () => Promise.reject(error),
        }
      )

      return (
        <div>
          <button onClick={() => mutation.mutate('todo')}>mutate</button>
          <div>
            error:{' '}
            {mutation.error instanceof Error ? mutation.error.message : 'null'},
            status: {mutation.status}
          </div>
        </div>
      )
    }

    const rendered = renderWithClient(queryClient, <Page />)

    await rendered.findByText('error: null, status: idle')

    rendered.getByRole('button', { name: /mutate/i }).click()

    await rendered.findByText('error: mutateFnError, status: error')
  })

  test('should go to error state if onSettled callback errors', async () => {
    const error = new Error('error from onSettled')
    const mutateFnError = new Error('mutateFnError')
    const onError = jest.fn()

    function Page() {
      const mutation = useMutation(
        async (_text: string) => {
          await sleep(10)
          throw mutateFnError
        },
        {
          onSettled: () => Promise.reject(error),
          onError,
        }
      )

      return (
        <div>
          <button onClick={() => mutation.mutate('todo')}>mutate</button>
          <div>
            error:{' '}
            {mutation.error instanceof Error ? mutation.error.message : 'null'},
            status: {mutation.status}
          </div>
        </div>
      )
    }

    const rendered = renderWithClient(queryClient, <Page />)

    await rendered.findByText('error: null, status: idle')

    rendered.getByRole('button', { name: /mutate/i }).click()

    await rendered.findByText('error: mutateFnError, status: error')

    expect(onError).toHaveBeenCalledWith(mutateFnError, 'todo', undefined)
  })
})
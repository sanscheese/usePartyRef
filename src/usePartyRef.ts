import {onMounted, onUnmounted, ref, Ref, UnwrapRef, watch} from "vue"
import PartySocket from "partysocket"

interface PartyRefConfig<T> {

    // Creates a namespace to keep your data separate from other projects, such as "my-project". Try to make this as unique as possible to avoid conflicts with other projects.
    namespace: string,

    // The name of the variable, such as "count".
    key: string,

    // The initial value of the ref, if it's never been set before.
    defaultValue: T

    // Self-hosting? Where is the PK server?
    host?: string
}

function isDevelopment(): boolean {
    // Vite
    // @ts-ignore
    if (import.meta.env?.MODE === 'development') {
        return true;
    }
    // Node
    if (typeof process !== 'undefined' && process.env.NODE_ENV === 'development') {
        return true;
    }
    // Webpack
    if (process.env.NODE_ENV === 'development') {
        return true;
    }
    return false;
}

/**
 * A Vue 3 ref that syncs in real-time with other clients using PartyKit.
 * @docs https://github.com/marchantweb/usePartyRef
 */
export function usePartyRef<T>(config: PartyRefConfig<T>): Ref<T> {

    let connection: PartySocket | null
    const localData: Ref<UnwrapRef<T>> = ref(config.defaultValue) as Ref<UnwrapRef<T>>
    const lastReceivedData: Ref<any> | Ref<null> = ref(null)

    onMounted(() => {

        // Initialize the connection
        connection = new PartySocket({
            host: config.host ?? (isDevelopment() ? "localhost:1999" : "https://usepartyref.sanscheese.partykit.dev"),
            room: config.namespace
        })

        // Request the current state from the server, or reset it if we're the first client
        connection.send(JSON.stringify({
            operation: "read",
            key: config.key,
            data: config.defaultValue
        }))

        // Listen for incoming updates from other clients
        connection.addEventListener("message", (event) => {
            const {key, data, error} = JSON.parse(event.data)
            if (key !== config.key) return
            if (localData.value === data) return
            if (!error) {
                lastReceivedData.value = structuredClone(data)
                localData.value = structuredClone(data)
                return
            }
            console.error(error)
        })

        // Watch the local data for changes and send it to other clients
        watch(localData, (newValue) => {
            if (connection && (JSON.stringify(newValue) !== JSON.stringify(lastReceivedData.value))) {
                connection.send(JSON.stringify({
                    operation: "write",
                    key: config.key,
                    data: newValue
                }))
            }
        }, {deep: true})
    })

    onUnmounted(() => {
        if (connection) {
            connection.close()
        }
    })

    return localData as Ref<T>
}

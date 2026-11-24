import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "../index";
import { contractDeviceTable, customerDeviceTable, interventionTable } from "../schema";
import {
    insertContract,
    insertCustomer,
    insertCustomerDevice,
    insertIntervention,
    linkContractDevice,
} from "../../test/db/fixtures";
import { createContract, deleteContractById, getContractById, updateContractById } from "./contract";
import {
    createCustomerDevice,
    deleteCustomerDeviceById,
    findCustomerDeviceIdsOfCustomer,
    listContractDeviceIds,
    listCustomerDevices,
    listDevicesOfContracts,
    updateCustomerDeviceById,
} from "./customerDevice";

/**
 * I vincoli dei dispositivi del cliente, provati con scritture dirette: una rotta futura o uno
 * script che aggirasse la validazione deve trovare comunque il database a rifiutarle.
 */
const constraintOf = (error: unknown): string | undefined => {
    const candidate = error as { constraint?: string; cause?: { constraint?: string } };

    return candidate.constraint ?? candidate.cause?.constraint;
};

const violation = async (action: () => Promise<unknown>) => {
    const error = await action().then(
        () => {
            throw new Error("la scrittura doveva essere rifiutata dal database");
        },
        (caught: unknown) => caught
    );

    return constraintOf(error);
};

const timeZone = "UTC";

describe("customer_device", () => {
    it("rifiuta un tipo sconosciuto", async () => {
        const customer = await insertCustomer();

        expect(
            await violation(() => insertCustomerDevice({ customerId: customer.id, type: "tostapane" as never }))
        ).toBe("customer_device_type_check");
    });

    it("il numero di serie è unico per cliente, senza badare alle maiuscole", async () => {
        const customer = await insertCustomer();
        const other = await insertCustomer();
        await insertCustomerDevice({ customerId: customer.id, serialNumber: "abc-1" });

        expect(await violation(() => insertCustomerDevice({ customerId: customer.id, serialNumber: "ABC-1" }))).toBe(
            "customer_device_customer_serial_lower_idx"
        );
        // Un altro cliente può avere lo stesso seriale.
        await expect(insertCustomerDevice({ customerId: other.id, serialNumber: "ABC-1" })).resolves.toBeDefined();
    });

    it("un cliente con dispositivi non si elimina", async () => {
        const device = await insertCustomerDevice();

        expect(await violation(() => db.execute(`delete from customer where id = ${device.customerId}` as never))).toBe(
            "customer_device_customer_id_customer_id_fk"
        );
    });

    it("lista filtrata per cliente, tipo e ricerca, in ordine di nome", async () => {
        const customer = await insertCustomer();
        await insertCustomerDevice({ customerId: customer.id, name: "Zeta", type: "firewall", serialNumber: "S-Z" });
        await insertCustomerDevice({ customerId: customer.id, name: "Alfa", type: "server", serialNumber: "S-A" });
        await insertCustomerDevice({ name: "Altro cliente" });

        const all = (await listCustomerDevices({ customerId: customer.id })) as { name: string }[];
        const servers = (await listCustomerDevices({ customerId: customer.id, type: "server" })) as { name: string }[];
        const bySerial = (await listCustomerDevices({ customerId: customer.id, search: "s-z" })) as {
            name: string;
        }[];

        expect(all.map((row) => row.name)).toEqual(["Alfa", "Zeta"]);
        expect(servers.map((row) => row.name)).toEqual(["Alfa"]);
        expect(bySerial.map((row) => row.name)).toEqual(["Zeta"]);
    });

    it("crea e modifica un dispositivo, valorizzando updated_at", async () => {
        const customer = await insertCustomer();
        const [created] = await createCustomerDevice({
            customerId: customer.id,
            type: "copier",
            name: "Ricoh",
            serialNumber: "R-1",
        });
        const [updated] = await updateCustomerDeviceById(created.id, { model: "MP C307" });

        expect(created.updated_at).toBeNull();
        expect(updated).toMatchObject({ model: "MP C307", name: "Ricoh" });
        expect(updated.updated_at).not.toBeNull();
    });
});

describe("contract_device", () => {
    it("collega un dispositivo dello stesso cliente", async () => {
        const contract = await insertContract();
        const device = await insertCustomerDevice({ customerId: contract.customerId });

        await linkContractDevice(contract.id, device.id, contract.customerId);

        expect(await listContractDeviceIds(contract.id)).toEqual([device.id]);
    });

    it("rifiuta il dispositivo di un altro cliente", async () => {
        const contract = await insertContract();
        const foreign = await insertCustomerDevice();

        // Con il cliente del contratto: il dispositivo non è suo.
        expect(await violation(() => linkContractDevice(contract.id, foreign.id, contract.customerId))).toBe(
            "contract_device_customer_device_fk"
        );
        // Con il cliente del dispositivo: il contratto non è suo.
        expect(await violation(() => linkContractDevice(contract.id, foreign.id, foreign.customerId))).toBe(
            "contract_device_contract_fk"
        );
    });

    it("lo stesso dispositivo non si collega due volte allo stesso contratto", async () => {
        const contract = await insertContract();
        const device = await insertCustomerDevice({ customerId: contract.customerId });
        await linkContractDevice(contract.id, device.id, contract.customerId);

        expect(await violation(() => linkContractDevice(contract.id, device.id, contract.customerId))).toBe(
            "contract_device_contract_id_customer_device_id_pk"
        );
    });

    it("eliminare il contratto porta via i collegamenti ma non i dispositivi", async () => {
        const contract = await insertContract();
        const device = await insertCustomerDevice({ customerId: contract.customerId });
        await linkContractDevice(contract.id, device.id, contract.customerId);

        await deleteContractById(contract.id);

        expect(await db.select().from(contractDeviceTable)).toHaveLength(0);
        expect(await db.select().from(customerDeviceTable).where(eq(customerDeviceTable.id, device.id))).toHaveLength(
            1
        );
    });

    it("eliminare un dispositivo ancora collegato è rifiutato", async () => {
        const contract = await insertContract();
        const device = await insertCustomerDevice({ customerId: contract.customerId });
        await linkContractDevice(contract.id, device.id, contract.customerId);

        expect(await violation(() => deleteCustomerDeviceById(device.id))).toBe("contract_device_customer_device_fk");
    });

    it("cambiare il cliente di un contratto con dispositivi collegati è rifiutato", async () => {
        const contract = await insertContract();
        const device = await insertCustomerDevice({ customerId: contract.customerId });
        await linkContractDevice(contract.id, device.id, contract.customerId);
        const other = await insertCustomer();

        expect(await violation(() => updateContractById(contract.id, { customerId: other.id }))).toBe(
            "contract_device_contract_fk"
        );
    });
});

describe("createContract / updateContractById con i dispositivi", () => {
    const newContract = async (customerId: number) => {
        const contract = await insertContract({ customerId });

        return contract;
    };

    it("crea il contratto con i dispositivi nella stessa transazione, e fa rollback se uno è di un altro cliente", async () => {
        const customer = await insertCustomer();
        const mine = await insertCustomerDevice({ customerId: customer.id });
        const foreign = await insertCustomerDevice();
        const base = await insertContract({ customerId: customer.id });
        const { id: _id, created_at: _c, updated_at: _u, ...data } = base;

        const created = await createContract(data, undefined, [mine.id]);

        expect(await listContractDeviceIds(created.id)).toEqual([mine.id]);

        await expect(createContract(data, undefined, [mine.id, foreign.id])).rejects.toBeDefined();
        // Il contratto del tentativo fallito non è rimasto: solo `base` e `created`.
        const { rows } = await import("../index").then(({ pool }) =>
            pool.query("select count(*)::int as total from contract")
        );
        expect(rows[0].total).toBe(2);
    });

    it("la modifica applica solo la differenza: toglie, aggiunge e lascia stare chi resta", async () => {
        const customer = await insertCustomer();
        const [a, b, c] = [
            await insertCustomerDevice({ customerId: customer.id }),
            await insertCustomerDevice({ customerId: customer.id }),
            await insertCustomerDevice({ customerId: customer.id }),
        ];
        const contract = await newContract(customer.id);
        await linkContractDevice(contract.id, a.id, customer.id);
        await linkContractDevice(contract.id, b.id, customer.id);

        await updateContractById(contract.id, {}, undefined, [b.id, c.id]);

        expect((await listContractDeviceIds(contract.id)).sort()).toEqual([b.id, c.id].sort());

        await updateContractById(contract.id, {}, undefined, []);

        expect(await listContractDeviceIds(contract.id)).toEqual([]);
    });

    it("senza `deviceIds` i collegamenti non si toccano", async () => {
        const contract = await insertContract();
        const device = await insertCustomerDevice({ customerId: contract.customerId });
        await linkContractDevice(contract.id, device.id, contract.customerId);

        await updateContractById(contract.id, { note: "x" });

        expect(await listContractDeviceIds(contract.id)).toEqual([device.id]);
    });

    it("cambiando cliente i dispositivi vecchi vanno via e quelli del nuovo si collegano", async () => {
        const oldCustomer = await insertCustomer();
        const newCustomer = await insertCustomer();
        const oldDevice = await insertCustomerDevice({ customerId: oldCustomer.id });
        const newDevice = await insertCustomerDevice({ customerId: newCustomer.id });
        const contract = await newContract(oldCustomer.id);
        await linkContractDevice(contract.id, oldDevice.id, oldCustomer.id);

        await updateContractById(contract.id, { customerId: newCustomer.id }, undefined, [newDevice.id]);

        const [row] = await getContractById(contract.id, timeZone);
        expect(row.customerId).toBe(newCustomer.id);
        expect(await listContractDeviceIds(contract.id)).toEqual([newDevice.id]);
    });

    it("togliere un dispositivo indicato da un intervento è rifiutato, e il contratto non cambia", async () => {
        const contract = await insertContract();
        const device = await insertCustomerDevice({ customerId: contract.customerId });
        await linkContractDevice(contract.id, device.id, contract.customerId);
        await insertIntervention({
            customerId: contract.customerId,
            contractId: contract.id,
            customerDeviceId: device.id,
        });

        expect(await violation(() => updateContractById(contract.id, { note: "nuova" }, undefined, []))).toBe(
            "intervention_contract_device_fk"
        );

        const [row] = await getContractById(contract.id, timeZone);
        expect(row.note).toBeNull();
    });

    it("listDevicesOfContracts raggruppa per contratto in una query, per nome", async () => {
        const customer = await insertCustomer();
        const first = await newContract(customer.id);
        const second = await newContract(customer.id);
        const zeta = await insertCustomerDevice({ customerId: customer.id, name: "Zeta" });
        const alfa = await insertCustomerDevice({ customerId: customer.id, name: "Alfa" });
        await linkContractDevice(first.id, zeta.id, customer.id);
        await linkContractDevice(first.id, alfa.id, customer.id);

        const map = await listDevicesOfContracts([first.id, second.id]);

        expect(map.get(first.id)?.map((device) => device.name)).toEqual(["Alfa", "Zeta"]);
        expect(map.has(second.id)).toBe(false);
        expect((await listDevicesOfContracts([])).size).toBe(0);
    });

    it("findCustomerDeviceIdsOfCustomer riconosce solo i dispositivi di quel cliente", async () => {
        const customer = await insertCustomer();
        const mine = await insertCustomerDevice({ customerId: customer.id });
        const foreign = await insertCustomerDevice();

        expect(await findCustomerDeviceIdsOfCustomer(customer.id, [mine.id, foreign.id, 99999])).toEqual([mine.id]);
        expect(await findCustomerDeviceIdsOfCustomer(customer.id, [])).toEqual([]);
    });
});

describe("intervention.customer_device_id", () => {
    it("accetta un dispositivo fra quelli del contratto", async () => {
        const contract = await insertContract();
        const device = await insertCustomerDevice({ customerId: contract.customerId });
        await linkContractDevice(contract.id, device.id, contract.customerId);

        const intervention = await insertIntervention({
            customerId: contract.customerId,
            contractId: contract.id,
            customerDeviceId: device.id,
        });

        expect(intervention.customerDeviceId).toBe(device.id);
    });

    it("rifiuta un dispositivo che esiste ma non è del contratto", async () => {
        const contract = await insertContract();
        const device = await insertCustomerDevice({ customerId: contract.customerId });

        expect(
            await violation(() =>
                insertIntervention({
                    customerId: contract.customerId,
                    contractId: contract.id,
                    customerDeviceId: device.id,
                })
            )
        ).toBe("intervention_contract_device_fk");
    });

    it("rifiuta un dispositivo senza contratto", async () => {
        const device = await insertCustomerDevice();

        expect(
            await violation(() => insertIntervention({ customerId: device.customerId, customerDeviceId: device.id }))
        ).toBe("intervention_device_contract_check");
    });

    it("un dispositivo indicato da un intervento non si elimina", async () => {
        const contract = await insertContract();
        const device = await insertCustomerDevice({ customerId: contract.customerId });
        await linkContractDevice(contract.id, device.id, contract.customerId);
        const intervention = await insertIntervention({
            customerId: contract.customerId,
            contractId: contract.id,
            customerDeviceId: device.id,
        });

        expect(await violation(() => deleteCustomerDeviceById(device.id))).toMatch(
            /^(intervention_customer_device_id_customer_device_id_fk|contract_device_customer_device_fk)$/
        );
        expect(
            (await db.select().from(interventionTable).where(eq(interventionTable.id, intervention.id)))[0]
                .customerDeviceId
        ).toBe(device.id);
    });
});
